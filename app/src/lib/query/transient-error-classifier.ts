/**
 * Classify driver/connector errors as transient (retry-worthy) or
 * permanent (no point retrying).
 *
 * Transient errors are the ones the route handler should turn into a
 * 408 REQUEST_TIMEOUT with a `Retry-After` header so the client can
 * auto-retry without surfacing the failure to the user. Permanent
 * errors fall through to the normal 500/4xx path so the user sees the
 * message immediately and can fix the query (or escalate).
 *
 * The classification is intentionally substring/keyword based — driver
 * error shapes differ wildly (pg, neo4j, undici, generic Node fs/net)
 * and we don't want to depend on driver internals here.
 *
 * Precedence: PERMANENT indicators win over TRANSIENT. A message like
 * `syntax error at "timeout"` is permanent — the syntax half means the
 * query will fail identically on retry.
 */

/** Substrings that mark an error as permanent regardless of other matches. */
const PERMANENT_KEYWORDS: readonly string[] = [
  "syntax error",
  "does not exist",
  "permission denied",
  "authentication failed",
  "password authentication",
  "invalid input",
  "expected an identifier", // Neo4j cypher syntax
  "econnrefused", // service is down / wrong port — not transient
  "enotfound", // DNS — not retryable in the request window
  "cannot read properties",
  "cannot find module",
];

/** Substrings that indicate a transient driver/network condition. */
const TRANSIENT_KEYWORDS: readonly string[] = [
  "etimedout",
  "timed out",
  "timeout",
  "econnreset",
  "connection terminated",
  "connection reset",
  "server closed the connection",
  "broken pipe",
  "socket hang up",
  "epipe",
  "statement timeout",
  "connection acquisition",
];

/** Node-style error codes that map directly to transient/permanent. */
const TRANSIENT_CODES = new Set<string>([
  "ETIMEDOUT",
  "ECONNRESET",
  "EPIPE",
  "ESOCKETTIMEDOUT",
]);

const PERMANENT_CODES = new Set<string>([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EHOSTUNREACH",
]);

/**
 * Return true when `err` looks like a transient driver/connector
 * failure that's worth a single auto-retry. Returns false for anything
 * that isn't an `Error`, anything matching a permanent keyword/code,
 * and anything that doesn't match a transient signal at all.
 */
export function isTransientQueryError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  const code = (err as Error & { code?: unknown }).code;
  const codeStr = typeof code === "string" ? code : "";
  if (codeStr && PERMANENT_CODES.has(codeStr)) return false;

  const haystack = err.message.toLowerCase();
  for (const kw of PERMANENT_KEYWORDS) {
    if (haystack.includes(kw)) return false;
  }

  if (codeStr && TRANSIENT_CODES.has(codeStr)) return true;

  for (const kw of TRANSIENT_KEYWORDS) {
    if (haystack.includes(kw)) return true;
  }

  return false;
}
