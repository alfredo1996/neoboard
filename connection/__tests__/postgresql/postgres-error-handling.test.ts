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
  type ConnectionConfig,
} from "@neoboard/connector-sdk";

// Read path streams through a server-side cursor; stub it so a fake client
// (which can't back a real pg-cursor) still exercises the transaction logic.
jest.mock("../../src/postgresql/cursor-read", () => ({
  readBoundedCursor: jest.fn().mockResolvedValue({ rows: [], fields: [] }),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(mod.authModule, "getPool").mockReturnValue(pool as any);

    const onFail = jest.fn();
    const onSuccess = jest.fn();

    // Must RESOLVE (not reject / not hang) — the caller settles only via callbacks.
    await expect(
      mod.runQuery(
        { query: "SELECT 1", params: {} },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(mod.authModule, "getPool").mockReturnValue(pool as any);

      await mod.runQuery(
        { query: "SELECT 1", params: {} },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { onSuccess: jest.fn(), onFail: jest.fn() } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(mod.authModule, "getPool").mockReturnValue(pool as any);

    await mod.runQuery(
      { query: "INSERT INTO t DEFAULT VALUES", params: {} },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { onSuccess: jest.fn(), onFail: jest.fn() } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      CONFIG({ accessMode: "WRITE" as any, parseToNeodashRecord: false }),
    );

    expect(queries).toContain("BEGIN");
    expect(queries).not.toContain("BEGIN TRANSACTION READ ONLY");
  });
});
