import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { redactSecrets, redactString } from "@/lib/log-redact";

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
