import { getNeo4jAuth, NEO4J_TEST_CONNECTION_CONFIG } from "../utils/setup";
import { Neo4jConnectionModule } from "../../src/neo4j/Neo4jConnectionModule";

/** #2444: an aborted Cypher read is terminated on the server, not just dropped. */
describe("Neo4j cancellation (#2444)", () => {
  const connection = new Neo4jConnectionModule(getNeo4jAuth());

  afterAll(async () => {
    await connection.getDriver().close();
  });

  const running = async () => {
    const session = connection.getDriver().session({ database: "system" });
    try {
      const res = await session.run(
        "SHOW TRANSACTIONS YIELD currentQuery WHERE currentQuery CONTAINS 'cancel-2444' AND NOT currentQuery STARTS WITH 'SHOW' RETURN count(*) AS n",
      );
      return res.records[0].get("n").toNumber() as number;
    } finally {
      await session.close();
    }
  };

  /** Polls until the marked query runs, or fails after 10 s. */
  const awaitRunning = async (): Promise<void> => {
    const deadline = Date.now() + 10_000;
    const step = async (): Promise<void> => {
      if ((await running()) >= 1) return;
      if (Date.now() > deadline) throw new Error("the query never started");
      await new Promise((r) => setTimeout(r, 100));
      return step();
    };
    return step();
  };

  test("a long Cypher read aborted after 1 s is gone from SHOW TRANSACTIONS within 2 s", async () => {
    const controller = new AbortController();
    const outcome: { error?: unknown } = {};
    const done = connection.runQuery(
      {
        query:
          "UNWIND range(1, 1000000) AS a UNWIND range(1, 1000000) AS b RETURN count(*) // cancel-2444",
      },
      {
        onSuccess: () => {},
        onFail: (e) => {
          outcome.error = e;
        },
      },
      {
        ...NEO4J_TEST_CONNECTION_CONFIG,
        accessMode: "READ",
        timeout: 60_000,
        signal: controller.signal,
      },
    );
    let abortedAt = 0;
    try {
      await awaitRunning();
      expect(await running()).toBe(1);
      abortedAt = Date.now();
    } finally {
      controller.abort();
      await done;
    }
    expect(outcome.error).toBeDefined();

    let left = await running();
    while (left > 0 && Date.now() - abortedAt < 2000) {
      await new Promise((r) => setTimeout(r, 100));
      left = await running();
    }
    expect(left).toBe(0);
  }, 40000);
});
