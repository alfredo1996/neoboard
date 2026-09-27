import pino from "pino";

/**
 * Always-on secret redaction for the structured logger.
 *
 * Opt-in redaction fails open: every new call site is a chance to forget,
 * and the one that forgets is the one that leaks. So this runs at the pino
 * boundary (`formatters.log` + `hooks.logMethod` in `logger.ts`), on every
 * log call from every logger, with no per-call-site cooperation required.
 * A developer has to work to opt *out*, not remember to opt in.
 *
 * It is deliberately NOT the same thing as `log-anonymizer.ts`. That one is
 * about privacy (hashing userId/email, masking the DB *username*) and stays
 * opt-in behind `LOG_ANONYMIZE`. This one is about credentials, which are
 * never acceptable in a log line, so it has no off switch.
 *
 * What it removes:
 *   - the password from any `scheme://user:password@host` URI, in any string
 *     (field value, log message, driver error message, stack frame)
 *   - values under credential-shaped keys, at any depth, in objects and arrays
 *   - inline `PASSWORD '...'` / `password=...` literals in SQL, Cypher and
 *     libpq-style connection strings
 *   - every property of an error beyond what it keeps below (#1934). A
 *     driver's diagnostics are user data — node-pg's `detail` holds the
 *     failing row — and a connector's wrapped `originalError` keeps only its
 *     type and code. See `ERROR_FIELDS`.
 *
 * What it deliberately KEEPS, because a log you cannot debug with is worse
 * than no log at all:
 *   - URI scheme, username, host, port and database — you need these to know
 *     *which* data source failed and as *whom*
 *   - error `type`, `message`, `stack` and driver `code` (SQLSTATE, ECONNREFUSED).
 *     A driver's message keeps its words by default, even where it quotes the
 *     value that failed; under `LOG_ANONYMIZE` each quoted value becomes
 *     `[value]`, inside its quotes, in `message` and `stack` (#1949). See
 *     `scrubQuotedValues`.
 *   - connectionId, connectionType, tenantId, requestId, durations, row counts
 *   - query text, unless `LOG_QUERY_TEXT=false` (see below)
 *
 * Env vars:
 *   LOG_QUERY_TEXT — true | false (default: true). The query audit trail logs
 *                    the user's query verbatim, which is the point of an audit
 *                    trail. A user *can* embed a literal secret in query text,
 *                    so operators who would rather lose the trail than take
 *                    that risk can set this to false.
 */

const REDACTED = "[REDACTED]";

/**
 * `scheme://user:password@` anywhere in a string.
 *
 * Deliberately narrow: the userinfo may not contain `/`, whitespace or `@`,
 * so a URL *path* holding a colon and an at-sign ("https://h/a:b@c") is not
 * mistaken for credentials. Group 3 (the password) is dropped; groups 1 and 2
 * (scheme and username) are kept.
 */
const URI_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s/@]*)@/gi;

/**
 * `PASSWORD 'literal'`, `IDENTIFIED BY "literal"`, `password='literal'`.
 *
 * Requires a quoted literal so that a *column* reference survives intact:
 * "SELECT id, password FROM users" must stay readable — redacting it would
 * destroy the audit trail to protect nothing.
 *
 * No leading `\b`: `PGPASSWORD=…` and `dbPassword=…` have no word boundary
 * before the keyword, and those are exactly the spellings that leak.
 */
const QUOTED_PASSWORD =
  /(password|passwd|pwd|identified\s+by)(\s*=\s*|\s+)('(?:[^']|'')*'|"[^"]*"|`[^`]*`)/gi;

/**
 * `password=literal` with no quotes — libpq conninfo and env-var style.
 * Only the `=` form, never bare whitespace, for the same column-reference
 * reason as above.
 */
const ASSIGNED_PASSWORD = /(password|passwd|pwd)(\s*=\s*)([^\s'"`;,)]+)/gi;

/** Cheap pre-filter so the expensive patterns skip the overwhelming majority. */
const PASSWORD_HINT = /passw|pwd|identified/i;

/**
 * Substrings that make a key credential-shaped. Matched against the key with
 * case and separators stripped, so `PGPASSWORD`, `api_key`, `x-api-key` and
 * `refreshToken` are all caught without enumerating spellings.
 *
 * Over-redaction is the accepted trade here: a field called `tokenCount` would
 * lose its value. Nothing logs one today, and a wrong redaction costs a debug
 * session while a wrong disclosure costs a database.
 */
const SENSITIVE_KEY_FRAGMENTS = [
  "password",
  "passwd",
  "passphrase",
  "secret",
  "token",
  "credential",
  "apikey",
  "authorization",
  "privatekey",
  "encryptionkey",
  "cookie",
];

function isSensitiveKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) =>
    normalised.includes(fragment),
  );
}

const KEEP_QUERY_TEXT = !["false", "0", "no", "off"].includes(
  (process.env.LOG_QUERY_TEXT ?? "").toLowerCase(),
);

/**
 * The values a driver quotes in its error text (#1949), each replaced by
 * `[value]` inside its quotes. The rule, by quote, from what the built-in
 * drivers write:
 *   '…'  a literal: `property \`email\` = 'alice@example.com'`. An apostrophe
 *        inside a word ("can't", "O'Brien") neither opens nor closes one.
 *   "…"  an identifier — `relation "users"`, `constraint "users_email_key"` —
 *        except after `: ` or `value `, which is where SQL puts the input it
 *        rejected (`for type integer: "abc"`, `value "999" is out of range`).
 *        That value is printed raw, so it runs to the last quote on its line.
 *        A stack's own `Name: ` header, and pino's `caused by: Name: `, is
 *        not such a `: `.
 *   `…`  an identifier, always: labels and property names.
 * A quote that does not close on its line runs to the end of it. Anything
 * unquoted stays, host and port included.
 *
 * Each pattern opens and closes a quote in one pass, never backtracking over
 * the rest of the line: this runs on every logged error, and a quadratic one
 * turned a 60 KB message into 4 seconds of blocked event loop.
 *
 * ponytail: a heuristic over English driver messages, not a parser. It misses
 * a value the driver does not quote (a uniqueness violation on a number:
 * `` `id` = 7 ``), the lines after the first of a value that spans lines, and
 * the rest of a single-quoted value after a quote inside it that a non-word
 * character follows (`'rock 'n' roll'` keeps ` roll'`). It over-scrubs a
 * single-quoted identifier (`Unknown function 'foo'`, a syntax error's
 * `Invalid input 'x'`) and, in `message`, a message that opens with a quoted
 * identifier once a cause chain prefixes it with `: `. Parse per driver in
 * the connector the day a miss matters.
 */
const DOUBLE_QUOTED_VALUE = /(: |\bvalue )"(?:[^\n]*"|[^\n]*)/g;
const STACK_DOUBLE_QUOTED_VALUE = new RegExp(
  String.raw`(?:^|\ncaused by: )[\w$.]+: |` + DOUBLE_QUOTED_VALUE.source,
  "g",
);
const SINGLE_QUOTED_VALUE = /(?<!\w)'(?:[^'\n]|'(?=\w))*(?:'(?!\w)|(?=\n|$))/g;

/**
 * Replace every quoted value in a driver's error text with `[value]`.
 * `stack`: the text is a stack, whose `Name: ` headers are kept.
 */
export function scrubQuotedValues(text: string, stack = false): string {
  // Fails closed: this runs inside pino's formatters.log, which does not
  // catch, and a long enough quoted run exhausts V8's regex backtracking
  // stack. A throw would make the log call itself throw; the unscrubbed text
  // would leak the value. Neither: a marker.
  try {
    return text
      .replace(
        stack ? STACK_DOUBLE_QUOTED_VALUE : DOUBLE_QUOTED_VALUE,
        (match, before?: string) =>
          before === undefined ? match : `${before}"[value]"`,
      )
      .replace(SINGLE_QUOTED_VALUE, "'[value]'");
  } catch {
    return "[unscrubbable]";
  }
}

/** Strip credentials from a free-text string. Safe to call on anything. */
export function redactString(text: string): string {
  let out = text;
  if (out.includes("://")) {
    out = out.replace(URI_CREDENTIALS, "$1$2:***@");
  }
  if (PASSWORD_HINT.test(out)) {
    out = out
      .replace(QUOTED_PASSWORD, "$1$2'***'")
      .replace(ASSIGNED_PASSWORD, "$1$2***");
  }
  return out;
}

/**
 * Deep-copy `value` with every credential removed. Never mutates the input —
 * the same Error object is usually re-thrown to the caller and must not be
 * altered by having been logged.
 *
 * `anonymize` is `LOG_ANONYMIZE`, handed in by the logger: it also scrubs the
 * quoted values out of every error's message and stack.
 */
export function redactSecrets(
  value: unknown,
  { anonymize = false }: { anonymize?: boolean } = {},
): unknown {
  return walk(value, new Set(), anonymize);
}

function walk(value: unknown, path: Set<object>, anonymize: boolean): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;

  // A Date carries no secret and pino renders it well; leave it alone.
  if (value instanceof Date) return value;
  // A URL keeps its password on a non-enumerable getter, but `toJSON` returns
  // the full href — so passing it through would print the password.
  if (value instanceof URL) return redactString(value.href);

  if (path.has(value)) return "[Circular]";
  path.add(value);
  try {
    // Here rather than via `serializers.err`, so it also applies to Errors
    // nested inside objects and arrays, which that hook never sees.
    if (value instanceof Error) return serializeError(value, path, anonymize);
    if (Array.isArray(value)) {
      return value.map((item) => walk(item, path, anonymize));
    }
    if (!isPlainObject(value)) {
      // ponytail: Buffers, Maps and class instances pass through untouched —
      // nothing logs one today. If that changes, unwrap it here rather than
      // at the call site.
      return value;
    }
    return redactEntries(value, path, anonymize);
  } finally {
    path.delete(value);
  }
}

/**
 * What an error is logged as: exactly what the header promises (#1934).
 *
 * pino's serializer copies every property of an error, and a driver's
 * diagnostics are user data — node-pg puts the failing row in `detail` and
 * the statement with its values in `where`. So an error keeps only these, and
 * a field nobody listed is not logged: a new one is added here on purpose.
 */
const ERROR_FIELDS = [
  // pino's own, and the driver's code (SQLSTATE, ECONNREFUSED).
  "type",
  "message",
  "stack",
  "code",
  // The named fields of our own error classes.
  "classification", // ConnectorError — schema metadata only, never a value
  "reason", // QueueRejectedError, QueueTimeoutError
  "feature", // EnterpriseRequiredError
  "status", // SaveError, ExportError
] as const;

/**
 * What an error is, by the `name` it sets. pino reads `constructor.name`,
 * which a production build minifies to "s" (#1957). A name that only says
 * "error" — a subclass that never set one, or a driver naming it after the
 * protocol message — says less than the class, so the class it is.
 */
function typeOf(err: Error): string {
  return !err.name || err.name.toLowerCase() === "error"
    ? err.constructor.name
    : err.name;
}

function serializeError(
  err: Error,
  path: Set<object>,
  anonymize: boolean,
): Record<string, unknown> {
  // pino flattens the `cause` chain into `message` and `stack`, so scrubbing
  // those two covers arbitrarily deep causes.
  // ponytail: an AggregateError's children are dropped; walk them here the
  // day something logs one.
  const serialized = pino.stdSerializers.err(err) as unknown as Record<
    string,
    unknown
  >;
  const out: Record<string, unknown> = {};
  serialized.type = typeOf(err);
  for (const key of ERROR_FIELDS) {
    if (serialized[key] !== undefined) {
      out[key] = walk(serialized[key], path, anonymize);
    }
  }
  if (anonymize) {
    for (const key of ["message", "stack"]) {
      if (typeof out[key] === "string") {
        out[key] = scrubQuotedValues(out[key], key === "stack");
      }
    }
  }
  // A connector's wrapped driver error: its class and code say which failure
  // it was. Its message is the wrapper's, already above; the rest is user
  // data. It used to be passed through whole — and, being a pino object
  // rather than a plain one, unscrubbed, credentials included.
  const inner = (err as { originalError?: unknown }).originalError;
  if (inner instanceof Error) {
    out.originalError = {
      type: typeOf(inner),
      code: walk((inner as { code?: unknown }).code, path, anonymize),
    };
  }
  return out;
}

function redactEntries(
  input: Record<string, unknown>,
  path: Set<object>,
  anonymize: boolean,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isSensitiveKey(key)) {
      output[key] = REDACTED;
    } else if (key === "query" && !KEEP_QUERY_TEXT) {
      output[key] = REDACTED;
    } else {
      output[key] = walk(value, path, anonymize);
    }
  }
  return output;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
