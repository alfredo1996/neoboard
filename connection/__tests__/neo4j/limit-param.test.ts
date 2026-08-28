import { getNeo4jAuth, NEO4J_TEST_CONNECTION_CONFIG } from "../utils/setup";
import { Neo4jConnectionModule } from "../../src/neo4j/Neo4jConnectionModule";
import { QueryCallback, QueryParams } from "@neoboard/connector-sdk";

/**
 * #1518 — `LIMIT $param` against a live Neo4j.
 *
 * The unit tests in coerce-params.test.ts prove the conversion; this proves it
 * reaches Cypher, which is the part that was broken. Before the fix the server
 * rejected every value:
 *
 *   LIMIT: Invalid input. '3.0' is not a valid value. Must be a non-negative
 *   integer.
 *
 * Assertions live in a resolved promise rather than in `onSuccess`, because a
 * callback that is never invoked would otherwise let the test pass green while
 * asserting nothing — the exact shape #1305 found in this suite.
 */
function runQuery(
  connection: Neo4jConnectionModule,
  queryParams: QueryParams,
): Promise<{ ok: true; rows: unknown[] } | { ok: false; error: unknown }> {
  return new Promise((resolve) => {
    const callbacks: QueryCallback<unknown[]> = {
      onSuccess: (rows) => resolve({ ok: true, rows }),
      onFail: (error) => resolve({ ok: false, error }),
    };
    connection
      .runQuery(queryParams, callbacks, NEO4J_TEST_CONNECTION_CONFIG)
      .catch((error) => resolve({ ok: false, error }));
  });
}

describe("Neo4j integer parameters (#1518)", () => {
  test("LIMIT $param is accepted and honoured", async () => {
    const connection = new Neo4jConnectionModule(getNeo4jAuth());
    const result = await runQuery(connection, {
      query: "MATCH (n) RETURN n LIMIT $param_limit",
      params: { param_limit: 3 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(String(result.error));
    expect(result.rows).toHaveLength(3);
  });

  test("SKIP $param is accepted", async () => {
    const connection = new Neo4jConnectionModule(getNeo4jAuth());
    const result = await runQuery(connection, {
      query: "MATCH (n) RETURN n SKIP $param_skip LIMIT $param_limit",
      params: { param_skip: 1, param_limit: 2 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(String(result.error));
    expect(result.rows).toHaveLength(2);
  });

  // The other half of the contract: widening every number would break this.
  test("a fractional parameter still compares as a float", async () => {
    const connection = new Neo4jConnectionModule(getNeo4jAuth());
    const result = await runQuery(connection, {
      query: "RETURN 1.5 > $param_threshold AS above",
      params: { param_threshold: 1.25 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(String(result.error));
    expect((result.rows[0] as Record<string, unknown>).above).toBe(true);
  });

  test("an integral parameter round-trips as a number, not a float string", async () => {
    const connection = new Neo4jConnectionModule(getNeo4jAuth());
    const result = await runQuery(connection, {
      query: "RETURN $param_n AS n",
      params: { param_n: 42 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(String(result.error));
    expect((result.rows[0] as Record<string, unknown>).n).toBe(42);
  });
});
