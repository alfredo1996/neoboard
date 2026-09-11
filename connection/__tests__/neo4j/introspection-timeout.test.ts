/**
 * #1302 — listDatabases and checkConnection called session.run(query) with no
 * transaction config, so neither was bounded once a connection existed. The
 * driver is lazy, so no container is needed: stub the session and read the
 * arguments.
 */
import { AuthType, DEFAULT_CONNECTION_CONFIG } from "@neoboard/connector-sdk";
import { Neo4jConnectionModule } from "../../src/neo4j/Neo4jConnectionModule";

function moduleWithSession(run: jest.Mock) {
  const mod = new Neo4jConnectionModule({
    username: "neo4j",
    password: "test",
    authType: AuthType.NATIVE,
    uri: "bolt://localhost:7687",
  });
  const session = { run, close: jest.fn().mockResolvedValue(undefined) };
  jest
    .spyOn(mod.authModule, "getDriver")
    .mockReturnValue({ session: () => session } as any);
  return mod;
}

describe("Neo4jConnectionModule introspection timeouts (#1302)", () => {
  it("listDatabases passes a transaction timeout", async () => {
    const run = jest
      .fn()
      .mockResolvedValue({ records: [{ get: () => "neo4j" }] });
    const mod = moduleWithSession(run);

    await expect(mod.listDatabases()).resolves.toEqual(["neo4j"]);

    expect(run).toHaveBeenCalledWith(
      expect.any(String),
      {},
      { timeout: 30_000 },
    );
  });

  it("checkConnection passes a transaction timeout", async () => {
    const run = jest.fn().mockResolvedValue({ records: [] });
    const mod = moduleWithSession(run);

    await expect(mod.checkConnection()).resolves.toBe(true);

    expect(run).toHaveBeenCalledWith(
      "RETURN 1 AS connected",
      {},
      { timeout: 30_000 },
    );
  });
});

// #1302: the widget path passed config.timeout straight to the driver, so an
// unset timeout meant the server default (unlimited on Neo4j 5) and 0 meant no
// timeout at all. PostgreSQL already falls back to the 30s default; so must this.
describe("Neo4jConnectionModule runQuery timeout fallback (#1302)", () => {
  it.each([
    ["undefined", undefined],
    ["0", 0],
  ])(
    "falls back to the 30s default when timeout is %s",
    async (_l, timeout) => {
      const mod = new Neo4jConnectionModule({
        username: "neo4j",
        password: "test",
        authType: AuthType.NATIVE,
        uri: "bolt://localhost:7687",
      });
      const executeRead = jest
        .fn()
        .mockResolvedValue({ rows: [], truncated: false });
      const session = {
        executeRead,
        close: jest.fn().mockResolvedValue(undefined),
      };
      jest
        .spyOn(mod.authModule, "getDriver")
        .mockReturnValue({ session: () => session } as any);

      await mod.runQuery(
        { query: "RETURN 1", params: {} },
        { onSuccess: jest.fn(), onFail: jest.fn() } as any,
        {
          ...DEFAULT_CONNECTION_CONFIG,
          timeout: timeout as any,
          parseToNeodashRecord: false,
        },
      );

      expect(executeRead).toHaveBeenCalledWith(expect.any(Function), {
        timeout: 30_000,
      });
    },
  );
});
