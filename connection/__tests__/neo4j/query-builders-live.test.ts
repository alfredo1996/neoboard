import { getNeo4jAuth, NEO4J_TEST_CONNECTION_CONFIG } from "../utils/setup";
import { Neo4jConnectionModule } from "../../src/neo4j/Neo4jConnectionModule";
import { buildNeo4jQuery } from "../../src/query-builders";
import type { QueryCallback, QuerySpec } from "@neoboard/connector-sdk";

/**
 * #1696 — the guided builder's Cypher run against a live Neo4j, not only
 * compared as text. A digits-only `contains` value can arrive as a number,
 * which the driver binds as an Integer; `toLower` accepts only strings, so
 * the text assertions alone passed while every such search failed (#1717).
 */
function run(
  spec: QuerySpec,
): Promise<{ ok: true; rows: unknown[] } | { ok: false; error: unknown }> {
  const { query, params } = buildNeo4jQuery(spec);
  const connection = new Neo4jConnectionModule(getNeo4jAuth());
  return new Promise((resolve) => {
    const callbacks: QueryCallback<unknown[]> = {
      onSuccess: (rows) => resolve({ ok: true, rows }),
      onFail: (error) => resolve({ ok: false, error }),
    };
    connection
      .runQuery({ query, params }, callbacks, NEO4J_TEST_CONNECTION_CONFIG)
      .catch((error) => resolve({ ok: false, error }));
  });
}

describe("guided Neo4j queries against a live database (#1696)", () => {
  test.each([13, "13"])(
    "contains matches %p as text",
    async (value) => {
      const result = await run({
        source: "Movie",
        fields: ["title"],
        filter: { field: "title", op: "contains", value },
      });

      if (!result.ok) throw new Error(String(result.error));
      // Rows are parser records: read the column, don't deep-compare.
      const titles = result.rows.map((r) => (r as { title: unknown }).title);
      expect(titles).toEqual(["Apollo 13"]);
    },
  );

  test("a comparison binds its value and filters on it", async () => {
    const result = await run({
      source: "Movie",
      fields: ["title", "released"],
      filter: { field: "released", op: ">", value: 2008 },
      limit: 100,
    });

    if (!result.ok) throw new Error(String(result.error));
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows as { released: number }[]) {
      expect(row.released).toBeGreaterThan(2008);
    }
  });
});
