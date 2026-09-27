import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  redactSecrets,
  redactString,
  scrubQuotedValues,
} from "@/lib/log-redact";
import { ConnectorErrorType, wrapError } from "@neoboard/connector-sdk";
import { QueueRejectedError } from "@/lib/query/scheduler";

/**
 * Real secret-shaped values. Every assertion checks the SECRET STRING is
 * absent from the serialised output — not merely that some key is missing,
 * because a password leaks just as well through a URI, a driver message or
 * a stack frame as it does through a `password` field.
 */
const SECRET = "Tr0ub4dor-hunter2";
const OTHER_SECRET = "c0rrect-horse-battery";

/** Serialise like pino would, then look for the secret anywhere in the line. */
function line(value: unknown): string {
  return JSON.stringify(redactSecrets(value));
}

describe("redactString — connection URI credentials", () => {
  it("strips the password from a postgresql URI but keeps user, host, port and database", () => {
    const out = redactString(
      `postgresql://neoboard:${SECRET}@db.internal:5432/analytics`,
    );
    expect(out).not.toContain(SECRET);
    expect(out).toContain("neoboard");
    expect(out).toContain("db.internal");
    expect(out).toContain("5432");
    expect(out).toContain("analytics");
  });

  it.each([
    `neo4j://neo4j:${SECRET}@graph.internal:7687`,
    `neo4j+s://neo4j:${SECRET}@graph.internal:7687`,
    `bolt://neo4j:${SECRET}@graph.internal:7687`,
    `postgres://u:${SECRET}@h:5432/d`,
    `mysql://u:${SECRET}@h:3306/d`,
    `redis://u:${SECRET}@h:6379`,
    `https://u:${SECRET}@example.com/path`,
  ])("strips the password from %s", (uri) => {
    expect(redactString(uri)).not.toContain(SECRET);
  });

  it("strips a password from a URI embedded in a driver error message", () => {
    const msg = `connect ECONNREFUSED for postgresql://neoboard:${SECRET}@db.internal:5432/analytics (SQLSTATE 08006)`;
    const out = redactString(msg);
    expect(out).not.toContain(SECRET);
    // The parts an operator actually debugs with survive.
    expect(out).toContain("ECONNREFUSED");
    expect(out).toContain("db.internal");
    expect(out).toContain("SQLSTATE 08006");
  });

  it("strips every URI when a message carries more than one", () => {
    const out = redactString(
      `failover from postgresql://u:${SECRET}@a:5432/d to postgresql://u:${OTHER_SECRET}@b:5432/d`,
    );
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain(OTHER_SECRET);
  });

  it("strips a percent-encoded password", () => {
    const out = redactString("postgresql://u:p%40ss%3Aw0rd%21@h:5432/d");
    expect(out).not.toContain("p%40ss%3Aw0rd%21");
    expect(out).toContain("h:5432");
  });

  it("leaves a credential-free URI untouched", () => {
    const uri = "postgresql://db.internal:5432/analytics";
    expect(redactString(uri)).toBe(uri);
  });

  it("does not mangle a URL whose path contains a colon and an at-sign", () => {
    const uri = "https://example.com/a:b@c/d";
    expect(redactString(uri)).toBe(uri);
  });

  it("returns non-URI text unchanged", () => {
    expect(redactString('relation "users" does not exist')).toBe(
      'relation "users" does not exist',
    );
  });
});

describe("redactString — inline password literals", () => {
  it("strips a SQL password literal but keeps the statement shape", () => {
    const out = redactString(`ALTER USER bob WITH PASSWORD '${SECRET}'`);
    expect(out).not.toContain(SECRET);
    expect(out).toContain("ALTER USER bob");
    expect(out).toContain("PASSWORD");
  });

  it("strips a Cypher SET PASSWORD literal", () => {
    const out = redactString(
      `CREATE USER analyst SET PASSWORD '${SECRET}' CHANGE NOT REQUIRED`,
    );
    expect(out).not.toContain(SECRET);
    expect(out).toContain("CREATE USER analyst");
    expect(out).toContain("CHANGE NOT REQUIRED");
  });

  it("strips an IDENTIFIED BY literal", () => {
    const out = redactString(`CREATE USER bob IDENTIFIED BY "${SECRET}"`);
    expect(out).not.toContain(SECRET);
  });

  it("strips a password= assignment", () => {
    const out = redactString(`host=db user=neoboard password='${SECRET}'`);
    expect(out).not.toContain(SECRET);
    expect(out).toContain("host=db");
    expect(out).toContain("user=neoboard");
  });

  it("strips an unquoted password from a libpq conninfo string", () => {
    const out = redactString(
      `host=db.internal port=5432 user=neoboard password=${SECRET} dbname=analytics`,
    );
    expect(out).not.toContain(SECRET);
    expect(out).toContain("host=db.internal");
    expect(out).toContain("user=neoboard");
    expect(out).toContain("dbname=analytics");
  });

  it("strips a PGPASSWORD-style assignment with no word boundary", () => {
    const out = redactString(`PGPASSWORD=${SECRET} psql -h db.internal`);
    expect(out).not.toContain(SECRET);
    expect(out).toContain("db.internal");
  });

  it("leaves a password COLUMN reference readable", () => {
    const sql = "SELECT id, password FROM users WHERE id = $1";
    expect(redactString(sql)).toBe(sql);
  });
});

describe("redactSecrets — sensitive keys at any depth", () => {
  it("redacts a top-level password", () => {
    expect(line({ password: SECRET })).not.toContain(SECRET);
  });

  it("redacts a password nested four levels deep", () => {
    const out = line({ a: { b: { c: { d: { password: SECRET } } } } });
    expect(out).not.toContain(SECRET);
  });

  it("redacts a secret inside an array of objects", () => {
    const out = line({ connections: [{ name: "prod", apiKey: SECRET }] });
    expect(out).not.toContain(SECRET);
    expect(out).toContain("prod");
  });

  it.each([
    "password",
    "passwordHash",
    "PGPASSWORD",
    "dbPassword",
    "passphrase",
    "credentials",
    "token",
    "refresh_token",
    "authorization",
    "apiKey",
    "api_key",
    "x-api-key",
    "privateKey",
    "ENCRYPTION_KEY",
    "clientSecret",
    "cookie",
  ])("redacts the %s key", (key) => {
    expect(line({ [key]: SECRET })).not.toContain(SECRET);
  });

  it("redacts an object-valued credentials field wholesale", () => {
    const out = line({ credentials: { user: "neoboard", pass: SECRET } });
    expect(out).not.toContain(SECRET);
  });

  it("keeps the fields operators debug with", () => {
    const out = line({
      connectionId: "conn-7",
      connectionType: "postgres",
      host: "db.internal",
      port: 5432,
      database: "analytics",
      errorCode: "28P01",
      durationMs: 42,
      rowCount: 10,
      requestId: "req-abc",
      tenantId: "tenant-1",
    });
    for (const keep of [
      "conn-7",
      "postgres",
      "db.internal",
      "5432",
      "analytics",
      "28P01",
      "req-abc",
      "tenant-1",
    ]) {
      expect(out).toContain(keep);
    }
  });
});

describe("redactSecrets — URIs in arbitrary places", () => {
  it("scrubs a URI held under a key nobody thought to list", () => {
    const out = line({
      config: { somethingNobodyListed: `bolt://neo4j:${SECRET}@h:7687` },
    });
    expect(out).not.toContain(SECRET);
    expect(out).toContain("h:7687");
  });

  it("scrubs URIs inside an array of strings", () => {
    const out = line({
      replicas: [
        `postgresql://u:${SECRET}@a:5432/d`,
        `postgresql://u:${OTHER_SECRET}@b:5432/d`,
      ],
    });
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain(OTHER_SECRET);
  });

  it("scrubs a URL instance", () => {
    const out = line({ target: new URL(`postgresql://u:${SECRET}@h:5432/d`) });
    expect(out).not.toContain(SECRET);
  });
});

describe("redactSecrets — Errors", () => {
  it("scrubs a URI out of a thrown driver error message and stack", () => {
    const err = new Error(
      `password authentication failed connecting to postgresql://neoboard:${SECRET}@db.internal:5432/analytics`,
    );
    (err as Error & { code?: string }).code = "28P01";
    const out = line({ err });
    expect(out).not.toContain(SECRET);
    // Everything worth keeping survives.
    expect(out).toContain("password authentication failed");
    expect(out).toContain("db.internal");
    expect(out).toContain("28P01");
    expect(out).toContain("Error");
  });

  it("scrubs a secret carried only by an Error cause chain", () => {
    const root = new Error(
      `getaddrinfo ENOTFOUND for neo4j://neo4j:${SECRET}@graph.internal:7687`,
    );
    const wrapper = new Error("Connection test failed", { cause: root });
    const out = line({ err: wrapper });
    expect(out).not.toContain(SECRET);
    expect(out).toContain("Connection test failed");
    expect(out).toContain("ENOTFOUND");
  });

  it("scrubs a secret two levels down a cause chain", () => {
    const root = new Error(`bad creds: postgresql://u:${SECRET}@h:5432/d`);
    const mid = new Error("driver failed", { cause: root });
    const top = new Error("query failed", { cause: mid });
    expect(line({ err: top })).not.toContain(SECRET);
  });

  it("redacts a sensitive custom property hung off an Error", () => {
    const err = new Error("boom") as Error & { password?: string };
    err.password = SECRET;
    expect(line({ err })).not.toContain(SECRET);
  });

  it("scrubs an Error nested inside a plain object", () => {
    const err = new Error(`postgresql://u:${SECRET}@h:5432/d refused`);
    expect(line({ details: { inner: err } })).not.toContain(SECRET);
  });

  it("scrubs an Error inside an array", () => {
    const err = new Error(`postgresql://u:${SECRET}@h:5432/d refused`);
    expect(line({ failures: [err] })).not.toContain(SECRET);
  });

  it("serialises an Error into type/message/stack so it is not logged as {}", () => {
    const result = redactSecrets({ err: new Error("boom") }) as {
      err: Record<string, unknown>;
    };
    expect(result.err.type).toBe("Error");
    expect(result.err.message).toContain("boom");
    expect(typeof result.err.stack).toBe("string");
  });
});

/**
 * #1934. A driver error carries diagnostics — `detail`, `where`, the failing
 * row — that are user data, and every property of it used to reach the log.
 * Worse, a *nested* error (a connector's `originalError`) skipped the credential
 * scrub entirely. An error is now logged as what the policy promises: type,
 * message, stack, code, and the named fields of our own error classes.
 */
describe("redactSecrets — only the fields the policy promises (#1934)", () => {
  /**
   * What node-pg throws: its own class, with diagnostics as own properties,
   * and a `name` that is the protocol message's — "error" (#1957).
   */
  class DatabaseError extends Error {
    name = "error";
  }
  const ROW_VALUE = "alice@example.com";
  const uniqueViolation = () =>
    Object.assign(
      new DatabaseError(
        'duplicate key value violates unique constraint "users_email_key"',
      ),
      {
        code: "23505",
        detail: `Key (email)=(${ROW_VALUE}) already exists.`,
        where: `SQL statement "INSERT INTO users(email) VALUES ('${ROW_VALUE}')"`,
        table: "users",
        column: "email",
        constraint: "users_email_key",
        schema: "public",
      },
    );

  it("keeps none of a wrapped driver error's diagnostics — only its type and code", () => {
    const out = redactSecrets({ err: wrapError(uniqueViolation()) }) as {
      err: Record<string, unknown>;
    };
    expect(JSON.stringify(out)).not.toContain(ROW_VALUE);
    expect(out.err.originalError).toEqual({
      type: "DatabaseError",
      code: "23505",
    });
    // The wrapper's own message is what an operator reads, and it stays.
    expect(out.err.message).toContain("users_email_key");
  });

  // Found in the #1934 drill: the nested error was passed through untouched,
  // so its message and stack skipped even the always-on credential scrub.
  it("leaks no credential from inside a wrapped driver error", () => {
    const driverErr = new Error(
      `connect failed for postgresql://app:${SECRET}@db.internal:5432/prod`,
    );
    expect(line({ err: wrapError(driverErr) })).not.toContain(SECRET);
  });

  // The other route: the app's own metadata database throws raw pg errors,
  // never wrapped, and they carry the same diagnostics.
  it("keeps none of a raw driver error's diagnostics, and its message, stack and code", () => {
    const out = redactSecrets({ err: uniqueViolation() }) as {
      err: Record<string, unknown>;
    };
    expect(JSON.stringify(out)).not.toContain(ROW_VALUE);
    expect(Object.keys(out.err).sort()).toEqual([
      "code",
      "message",
      "stack",
      "type",
    ]);
    expect(out.err.code).toBe("23505");
  });

  it("keeps the named fields our own errors declare", () => {
    const rejected = redactSecrets({
      err: new QueueRejectedError("shed", "Query shed under load"),
    }) as { err: Record<string, unknown> };
    expect(rejected.err.reason).toBe("shed");

    // Schema metadata only — a constraint's kind, column and name, never a value.
    const constraint = redactSecrets({
      err: wrapError(uniqueViolation(), () => ({
        type: ConnectorErrorType.CONSTRAINT,
        transient: false,
        constraint: {
          kind: "unique",
          column: "email",
          name: "users_email_key",
        },
      })),
    }) as { err: Record<string, unknown> };
    expect(constraint.err.classification).toEqual({
      type: ConnectorErrorType.CONSTRAINT,
      transient: false,
      constraint: { kind: "unique", column: "email", name: "users_email_key" },
    });
  });

  // Fail closed: a field nobody listed is not logged. A new one has to be
  // added to the allowlist on purpose, with a reason.
  it("drops a field nobody listed", () => {
    const err = Object.assign(new Error("boom"), { payload: "row data" });
    expect(line({ err })).not.toContain("row data");
  });
});

/**
 * #1957. A production build minifies class names, so a type read off the
 * constructor logged as "s" or "b". The `name` an error sets survives.
 */
describe("redactSecrets — an error's type is its name, not its class (#1957)", () => {
  // What the minifier leaves: a one-letter class whose `name` is the real one.
  class s extends Error {
    name = "ConnectorError";
  }
  class b extends Error {
    name = "Neo4jError";
  }
  const typeOf = (err: Error) =>
    (redactSecrets({ err }) as { err: Record<string, unknown> }).err;

  it("logs a minified class under the name it set", () => {
    expect(typeOf(new s("boom")).type).toBe("ConnectorError");
  });

  it("logs a minified wrapped driver error under the name it set", () => {
    const wrapped = Object.assign(new s("boom"), {
      originalError: Object.assign(new b("boom"), { code: "X" }),
    });
    expect(typeOf(wrapped).originalError).toEqual({
      type: "Neo4jError",
      code: "X",
    });
  });

  it("falls back to the class for a subclass that never set a name", () => {
    class DatabaseError extends Error {}
    expect(typeOf(new DatabaseError("boom")).type).toBe("DatabaseError");
  });
});

/**
 * A driver's message can quote the data that failed (#1949). The default
 * keeps it — a log you cannot debug with is worse than none — but an operator
 * who set LOG_ANONYMIZE asked for the values to go, while the schema names
 * around them stay.
 */
// The scrub runs inside pino's formatters.log, which does not catch: a throw
// there makes the log call itself throw and replaces the error being logged.
// A long enough quoted run exhausts V8's regex backtracking stack (#1949).
describe("scrubQuotedValues fails closed (#1949)", () => {
  it("answers a marker, not a throw and not the text, for a value too long to scrub", () => {
    const huge = `invalid input: '${"a".repeat(12_000_000)}`;
    let out = "";
    expect(() => {
      out = scrubQuotedValues(huge);
    }).not.toThrow();
    expect(out).toBe("[unscrubbable]");
  });
});

describe("redactSecrets — quoted values under LOG_ANONYMIZE (#1949)", () => {
  const VALUE = "alice@example.com";
  // What the graph driver throws for a uniqueness violation.
  const graphMessage = `Node(12) already exists with label \`User\` and property \`email\` = '${VALUE}'`;
  const errOf = (err: Error, anonymize?: boolean) =>
    (
      redactSecrets(
        { err },
        anonymize === undefined ? undefined : { anonymize },
      ) as {
        err: Record<string, string>;
      }
    ).err;

  it("scrubs a quoted value out of a wrapped driver error's message and stack", () => {
    const out = errOf(wrapError(new Error(graphMessage)), true);
    for (const text of [out.message, out.stack]) {
      expect(text).not.toContain(VALUE);
      expect(text).toContain("label `User` and property `email` = '[value]'");
    }
  });

  it("leaves the same error unchanged by default", () => {
    const err = wrapError(new Error(graphMessage));
    for (const out of [errOf(err), errOf(err, false)]) {
      expect(out.message).toBe(graphMessage);
      expect(out.stack).toContain(graphMessage);
    }
  });

  it.each([
    [
      'invalid input syntax for type integer: "abc"',
      'invalid input syntax for type integer: "[value]"',
    ],
    [
      'invalid input value for enum mood: "happy"',
      'invalid input value for enum mood: "[value]"',
    ],
    [
      'value "99999999999" is out of range for type integer',
      'value "[value]" is out of range for type integer',
    ],
    // A value the driver prints raw, quotes and all, runs to the last quote.
    [
      'invalid input syntax for type json: "{"a": "b"}"',
      'invalid input syntax for type json: "[value]"',
    ],
    // An apostrophe inside a word neither opens nor closes a literal.
    [
      "Can't merge: property `name` = 'O'Brien'",
      "Can't merge: property `name` = '[value]'",
    ],
    // A quote that never closes runs to the end of its line.
    ["property `name` = 'alice", "property `name` = '[value]'"],
    ['for type integer: "abc', 'for type integer: "[value]"'],
  ])("scrubs the value in %s", (message, expected) => {
    expect(scrubQuotedValues(message)).toBe(expected);
  });

  // ponytail's ceiling, pinned: a value spanning lines loses its first line
  // only, since a quote never runs past its line.
  it.each([
    ["property `bio` = 'first\nsecond'", "property `bio` = '[value]'\nsecond'"],
    ['for type integer: "12\n34"', 'for type integer: "[value]"\n34"'],
  ])("scrubs only the first line of %j", (message, expected) => {
    expect(scrubQuotedValues(message)).toBe(expected);
  });

  // Logged the way the logger logs it, so the stack's own `Name: ` header —
  // and pino's `caused by: Name: ` — sits in front of the message.
  it.each([
    "connect ECONNREFUSED 10.0.0.5:5432",
    'relation "users" does not exist',
    '"users_view" is not a table',
    'column "email" of relation "user" does not exist',
    'duplicate key value violates unique constraint "users_email_key"',
    'null value in column "email" of relation "users" violates not-null constraint',
    "Variable `n` not defined",
  ])("keeps %s, which quotes no value", (message) => {
    expect(scrubQuotedValues(message)).toBe(message);
    const out = errOf(wrapError(new Error(message)), true);
    expect(out.message).toBe(message);
    expect(out.stack.split("\n")[0]).toBe(`ConnectorError: ${message}`);
    const caused = errOf(
      new Error("query failed", { cause: new Error(message) }),
      true,
    );
    expect(caused.stack).toContain(`\ncaused by: Error: ${message}\n`);
  });

  /** CPU time of one run, not wall time (#1993): a busy runner adds none. */
  function cpuMs(run: () => void): number {
    const start = process.cpuUsage();
    run();
    const { user, system } = process.cpuUsage(start);
    return (user + system) / 1000;
  }

  // A pattern that backtracks turns one long driver message into seconds of a
  // blocked event loop, on every request, under LOG_ANONYMIZE: every quote
  // must open, and close, in one pass.
  it.each([
    ["an unclosed single quote", " 'a"],
    ["an unclosed double quote after `: `", ': "a'],
    ['an unclosed double quote after "value "', 'value "a'],
    ["a line per double quote", ': "a\n'],
  ])(
    "scrubs a 120 KB message of %s in linear time",
    (_, unit) => {
      const message = unit.repeat(Math.ceil(120_000 / unit.length));
      const ms = cpuMs(() => errOf(new Error(message), true));
      expect(ms).toBeLessThan(200);
    },
    60_000,
  );
});

describe("redactSecrets — hostile shapes", () => {
  it("survives a circular reference", () => {
    const node: Record<string, unknown> = { name: "a", password: SECRET };
    node.self = node;
    const out = redactSecrets(node) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  it("survives a circular reference through an array", () => {
    const arr: unknown[] = [];
    arr.push(arr, { password: SECRET });
    expect(() => redactSecrets(arr)).not.toThrow();
    expect(JSON.stringify(redactSecrets(arr))).not.toContain(SECRET);
  });

  it("passes primitives, null and Dates through untouched", () => {
    const d = new Date("2026-01-01T00:00:00.000Z");
    expect(redactSecrets(1)).toBe(1);
    expect(redactSecrets(true)).toBe(true);
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(undefined)).toBeUndefined();
    expect(redactSecrets(d)).toBe(d);
  });

  it("scrubs a bare string", () => {
    expect(redactSecrets(`postgresql://u:${SECRET}@h/d`)).not.toContain(SECRET);
  });
});

describe("redactSecrets — query text (LOG_QUERY_TEXT)", () => {
  const original = process.env.LOG_QUERY_TEXT;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.LOG_QUERY_TEXT;
    else process.env.LOG_QUERY_TEXT = original;
  });

  it("keeps query text by default — it is the audit trail", async () => {
    delete process.env.LOG_QUERY_TEXT;
    const mod = await import("@/lib/log-redact");
    const out = JSON.stringify(
      mod.redactSecrets({ query: "SELECT id FROM users WHERE tenant = $1" }),
    );
    expect(out).toContain("SELECT id FROM users");
  });

  it("still scrubs an embedded secret from kept query text", async () => {
    delete process.env.LOG_QUERY_TEXT;
    const mod = await import("@/lib/log-redact");
    const out = JSON.stringify(
      mod.redactSecrets({ query: `ALTER USER bob WITH PASSWORD '${SECRET}'` }),
    );
    expect(out).not.toContain(SECRET);
  });

  it("drops query text entirely when LOG_QUERY_TEXT=false", async () => {
    process.env.LOG_QUERY_TEXT = "false";
    const mod = await import("@/lib/log-redact");
    const out = JSON.stringify(
      mod.redactSecrets({ query: "SELECT id FROM users" }),
    );
    expect(out).not.toContain("SELECT id FROM users");
  });
});
