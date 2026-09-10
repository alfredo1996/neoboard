/**
 * Unit regressions for PostgresConnectionModule error handling — mocked pool,
 * no testcontainer. Guards two security/correctness fixes:
 *   #CRITICAL: runQuery must never reject (a rejected pool.connect() used to
 *              leave the caller's callback-settled promise pending forever).
 *   #HIGH:     read-only enforcement must fail CLOSED (only accessMode "WRITE"
 *              gets a read-write transaction).
 */
import { PostgresConnectionModule } from "../../src/postgresql/PostgresConnectionModule";
import {
  DEFAULT_CONNECTION_CONFIG,
  AuthType,
  ConnectorErrorType,
  QueryStatus,
  type ConnectionConfig,
} from "@neoboard/connector-sdk";

// Read path streams through a server-side cursor; stub it so a fake client
// (which can't back a real pg-cursor) still exercises the transaction logic.
jest.mock("../../src/postgresql/cursor-read", () => ({
  readBoundedCursor: jest.fn().mockResolvedValue({ rows: [], fields: [] }),
  // Writes drain rather than stopping early (#1298); the write path calls
  // this one, so the double has to provide it or every write test fails on
  // "drainBoundedCursor is not a function" rather than on its own assertion.
  drainBoundedCursor: jest.fn().mockResolvedValue({
    rows: [],
    fields: [],
    affectedRowCount: 0,
  }),
}));

function makeModule(): PostgresConnectionModule {
  return new PostgresConnectionModule({
    username: "u",
    password: "p",
    authType: AuthType.NATIVE,
    uri: "postgresql://localhost:5432/db",
  });
}

function fakeClient(queries: string[]) {
  return {
    query: jest.fn((q: string): Promise<any> => {
      queries.push(q);
      return Promise.resolve({ rows: [], fields: [], rowCount: 0 });
    }),
    release: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
  };
}

const CONFIG = (over: Partial<ConnectionConfig>): ConnectionConfig =>
  ({
    ...DEFAULT_CONNECTION_CONFIG,
    rowLimit: 100,
    ...over,
  }) as ConnectionConfig;

describe("PostgresConnectionModule — runQuery never rejects (#CRITICAL)", () => {
  it("routes a failed pool.connect() to onFail and resolves (no hang)", async () => {
    const mod = makeModule();
    const pool = {
      connect: jest
        .fn()
        .mockRejectedValue(new Error("Connection terminated due to timeout")),
    };
    jest.spyOn(mod.authModule, "getPool").mockReturnValue(pool as any);

    const onFail = jest.fn();
    const onSuccess = jest.fn();

    // Must RESOLVE (not reject / not hang) — the caller settles only via callbacks.
    await expect(
      mod.runQuery(
        { query: "SELECT 1", params: {} },
        { onFail, onSuccess } as any,
        CONFIG({}),
      ),
    ).resolves.toBeUndefined();

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it("routes a non-auth verifyAuthentication failure to onFail (no hang)", async () => {
    const mod = makeModule();
    // No pool yet → runQuery calls verifyAuthentication, which rejects with a
    // NETWORK error (not an auth error). It must reach the outer catch → onFail,
    // never escape runQuery.
    jest.spyOn(mod.authModule, "getPool").mockReturnValue(null);
    jest
      .spyOn(mod.authModule, "verifyAuthentication")
      .mockRejectedValue(new Error("getaddrinfo ENOTFOUND db.internal"));

    const onFail = jest.fn();
    const onSuccess = jest.fn();

    await expect(
      mod.runQuery(
        { query: "SELECT 1", params: {} },
        { onFail, onSuccess } as any,
        CONFIG({}),
      ),
    ).resolves.toBeUndefined();

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFail).toHaveBeenCalledTimes(1);
  });
});

describe("PostgresConnectionModule — read-only fails closed (#HIGH)", () => {
  it.each([
    ["undefined", undefined],
    ['mis-cased "read"', "read"],
    ['explicit "READ"', "READ"],
  ])(
    "uses a READ ONLY transaction when accessMode is %s",
    async (_label, accessMode) => {
      const mod = makeModule();
      const queries: string[] = [];
      const pool = {
        connect: jest.fn().mockResolvedValue(fakeClient(queries)),
      };
      jest.spyOn(mod.authModule, "getPool").mockReturnValue(pool as any);

      await mod.runQuery(
        { query: "SELECT 1", params: {} },
        { onSuccess: jest.fn(), onFail: jest.fn() } as any,
        CONFIG({ accessMode: accessMode as any, parseToNeodashRecord: false }),
      );

      expect(queries).toContain("BEGIN TRANSACTION READ ONLY");
      expect(queries).not.toContain("BEGIN");
    },
  );

  it('uses a read-write BEGIN only for accessMode "WRITE"', async () => {
    const mod = makeModule();
    const queries: string[] = [];
    const pool = { connect: jest.fn().mockResolvedValue(fakeClient(queries)) };
    jest.spyOn(mod.authModule, "getPool").mockReturnValue(pool as any);

    await mod.runQuery(
      { query: "INSERT INTO t DEFAULT VALUES", params: {} },
      { onSuccess: jest.fn(), onFail: jest.fn() } as any,
      CONFIG({ accessMode: "WRITE" as any, parseToNeodashRecord: false }),
    );

    expect(queries).toContain("BEGIN");
    expect(queries).not.toContain("BEGIN TRANSACTION READ ONLY");
  });
});

describe("PostgresConnectionModule — error-path routing", () => {
  it("routes an auth failure (verifyAuthentication rejects with an auth error) to onFail", async () => {
    const mod = makeModule();
    jest.spyOn(mod.authModule, "getPool").mockReturnValue(null);
    // Auth-classified rejection → swallowed to `false` → the same ConnectorError.
    jest.spyOn(mod.authModule, "verifyAuthentication").mockRejectedValue({
      code: "28P01",
      message: "password authentication failed",
    });

    const onFail = jest.fn();
    const onSuccess = jest.fn();
    await mod.runQuery(
      { query: "SELECT 1", params: {} },
      { onFail, onSuccess } as any,
      CONFIG({}),
    );

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(String((onFail.mock.calls[0][0] as Error).message)).toMatch(
      /authentication failed/i,
    );
  });

  /**
   * #1678 — the real path for bad credentials: verifyAuthentication swallows
   * the driver's 28P01 and resolves `false`. This used to emit a plain
   * Error("Failed to authenticate…"), which the query route could not tell
   * from a bug and answered with 500 — no hint, no store flag, gated siblings
   * left on "Waiting for parameters…". It must be a ConnectorError whose
   * message the route's classifier reads as auth_failed.
   */
  it("reports refused credentials as a ConnectorError the route can classify (#1678)", async () => {
    const mod = makeModule();
    jest.spyOn(mod.authModule, "getPool").mockReturnValue(null);
    jest.spyOn(mod.authModule, "verifyAuthentication").mockResolvedValue(false);

    const onFail = jest.fn();
    const setStatus = jest.fn();
    await mod.runQuery(
      { query: "SELECT 1", params: {} },
      { onFail, onSuccess: jest.fn(), setStatus } as any,
      CONFIG({}),
    );

    const err = onFail.mock.calls[0][0] as Error & { type: ConnectorErrorType };
    expect(err.name).toBe("ConnectorError");
    expect(err.type).toBe(ConnectorErrorType.AUTHENTICATION);
    expect(err.message).toMatch(/authentication failed/i);
    expect(setStatus).toHaveBeenCalledWith(QueryStatus.ERROR);
  });

  it("still reports onFail when ROLLBACK itself fails (rollback error logged, not rethrown)", async () => {
    const mod = makeModule();
    const client = {
      query: jest.fn((q: string): Promise<any> => {
        if (q === "BEGIN") return Promise.resolve({});
        if (q.startsWith("INSERT"))
          return Promise.reject(new Error("insert exploded"));
        if (q === "ROLLBACK")
          return Promise.reject({ code: "25P02", message: "in failed txn" });
        return Promise.resolve({ rows: [], fields: [], rowCount: 0 });
      }),
      release: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
    };
    const pool = { connect: jest.fn().mockResolvedValue(client) };
    jest.spyOn(mod.authModule, "getPool").mockReturnValue(pool as any);
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    // Writes now stream through drainBoundedCursor rather than client.query
    // (#1298), so that is where the statement failure originates. The test's
    // subject is unchanged: a failing query whose ROLLBACK also fails must
    // still surface the ORIGINAL error through onFail.
    const { drainBoundedCursor } = require("../../src/postgresql/cursor-read");
    (drainBoundedCursor as jest.Mock).mockRejectedValueOnce(
      new Error("insert exploded"),
    );

    const onFail = jest.fn();
    await mod.runQuery(
      { query: "INSERT INTO t VALUES (1)", params: {} },
      { onFail, onSuccess: jest.fn() } as any,
      CONFIG({ accessMode: "WRITE" as any, parseToNeodashRecord: false }),
    );

    // The original query error surfaces; the ROLLBACK failure is only logged
    // (by SQLSTATE code), never rethrown — runQuery still resolves.
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(String((onFail.mock.calls[0][0] as Error).message)).toMatch(
      /insert exploded/i,
    );
    expect(client.release).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// #1302: a falsy timeout used to skip SET LOCAL entirely — no bound at all,
// rather than the documented default bound.
describe("PostgresConnectionModule — statement timeout is unconditional (#1302)", () => {
  it.each([
    ["undefined", undefined],
    ["0", 0],
  ])(
    "falls back to the 30s default when timeout is %s",
    async (_l, timeout) => {
      const mod = makeModule();
      const queries: string[] = [];
      const pool = {
        connect: jest.fn().mockResolvedValue(fakeClient(queries)),
      };
      jest.spyOn(mod.authModule, "getPool").mockReturnValue(pool as any);

      await mod.runQuery(
        { query: "SELECT 1", params: {} },
        { onSuccess: jest.fn(), onFail: jest.fn() } as any,
        CONFIG({ timeout: timeout as any, parseToNeodashRecord: false }),
      );

      expect(queries).toContain("SET LOCAL statement_timeout = '30000'");
    },
  );

  it("keeps an explicit timeout", async () => {
    const mod = makeModule();
    const queries: string[] = [];
    const pool = { connect: jest.fn().mockResolvedValue(fakeClient(queries)) };
    jest.spyOn(mod.authModule, "getPool").mockReturnValue(pool as any);

    await mod.runQuery(
      { query: "SELECT 1", params: {} },
      { onSuccess: jest.fn(), onFail: jest.fn() } as any,
      CONFIG({ timeout: 1234.9, parseToNeodashRecord: false }),
    );

    expect(queries).toContain("SET LOCAL statement_timeout = '1234'");
  });
});

// #1302: introspection and health checks ran with no bound once a connection
// was established. Each now routes through one bounded, guarded checkout.
describe("PostgresConnectionModule — introspection and health checks are bounded (#1302)", () => {
  function guardedClient(result: Promise<unknown>) {
    return {
      query: jest.fn().mockReturnValue(result),
      release: jest.fn(),
      on: jest.fn(),
      removeListener: jest.fn(),
    };
  }

  const cases: [
    string,
    (m: PostgresConnectionModule) => Promise<unknown>,
    unknown,
  ][] = [
    ["listDatabases", (m) => m.listDatabases(), ["postgres"]],
    ["listSchemas", (m) => m.listSchemas(), ["postgres"]],
    ["checkConnection", (m) => m.checkConnection(), true],
  ];

  it.each(cases)(
    "%s runs with a client-side query_timeout on a guarded client",
    async (_name, call, expected) => {
      const mod = makeModule();
      const client = guardedClient(
        Promise.resolve({
          rows: [{ datname: "postgres", schema_name: "postgres" }],
        }),
      );
      const pool = { connect: jest.fn().mockResolvedValue(client) };
      jest.spyOn(mod.authModule, "getPool").mockReturnValue(pool as any);

      await expect(call(mod)).resolves.toEqual(expected);

      expect(client.query).toHaveBeenCalledWith(
        expect.objectContaining({ query_timeout: 30_000 }),
      );
      const listener = client.on.mock.calls[0][1];
      expect(client.on).toHaveBeenCalledWith("error", listener);
      expect(client.removeListener).toHaveBeenCalledWith("error", listener);
      expect(client.release).toHaveBeenCalledWith(undefined);
    },
  );

  // A timed-out client may still be running (or wedged) on the server;
  // handing it back would give the next caller a client that never answers.
  it.each(cases)(
    "%s destroys the client instead of returning it to the pool when the query fails",
    async (_name, call) => {
      const mod = makeModule();
      const timeout = new Error("Query read timeout");
      const client = guardedClient(Promise.reject(timeout));
      const pool = { connect: jest.fn().mockResolvedValue(client) };
      jest.spyOn(mod.authModule, "getPool").mockReturnValue(pool as any);
      jest.spyOn(console, "warn").mockImplementation(() => {});

      await call(mod).catch(() => undefined);

      expect(client.release).toHaveBeenCalledWith(timeout);
      expect(client.removeListener).toHaveBeenCalled();
    },
  );
});
