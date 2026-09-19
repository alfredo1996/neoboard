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
//
// #1898: the default is this connector's own to resolve, from the field IT
// declares (`queryTimeout`). The app passes config.timeout only for an
// explicit per-query override.
describe("Neo4jConnectionModule runQuery timeout resolution (#1302, #1898)", () => {
  it.each([
    ["the default when timeout is undefined", {}, undefined, 30_000],
    ["the default when timeout is 0", {}, 0, 30_000],
    ["its declared queryTimeout", { queryTimeout: 23_456 }, undefined, 23_456],
    [
      "an explicit per-query override over the bag",
      { queryTimeout: 23_456 },
      777,
      777,
    ],
    [
      "the default for a zero in the bag",
      { queryTimeout: 0 },
      undefined,
      30_000,
    ],
    [
      "the default, not statementTimeout — a field it does not declare",
      { statementTimeout: 12_345 },
      undefined,
      30_000,
    ],
  ])("uses %s", async (_label, options, timeout, expected) => {
    const mod = new Neo4jConnectionModule({
      username: "neo4j",
      password: "test",
      authType: AuthType.NATIVE,
      uri: "bolt://localhost:7687",
      ...options,
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
      { ...DEFAULT_CONNECTION_CONFIG, timeout },
    );

    expect(executeRead).toHaveBeenCalledWith(expect.any(Function), {
      timeout: expected,
    });
  });
});
