/**
 * #1302 — listDatabases and checkConnection called session.run(query) with no
 * transaction config, so neither was bounded once a connection existed. The
 * driver is lazy, so no container is needed: stub the session and read the
 * arguments.
 */
import { AuthType } from "@neoboard/connector-sdk";
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
