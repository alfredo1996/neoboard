import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { registerConnector, unregisterConnector } from "@neoboard/connection";
import {
  fixtureConnector,
  fixtureDescriptor,
  FIXTURE_ROWS,
  fixtureRuns,
} from "@/__tests__/fixtures/fixture-connector";
import { closeAllConnections, executeQuery } from "@/lib/query/query-executor";

/**
 * #1948 (epic #1893, AC4): a connector that exists only in test code is not
 * just configurable but usable. The REAL executor — registry, module cache,
 * row-limit clamp, callbacks — runs a query through it and reads the rows
 * back. Nothing here is mocked, so a connector-specific branch anywhere on
 * that path would fail this test.
 */
const TYPE = fixtureDescriptor.type;
const CONFIG = { endpoint: "acme://host/book", apiToken: "tok" };

describe("executeQuery through a connector defined only in test code (#1948)", () => {
  beforeEach(() => {
    registerConnector(fixtureConnector);
    fixtureRuns.length = 0;
  });

  afterEach(async () => {
    await closeAllConnections();
    unregisterConnector(TYPE);
  });

  it("returns the connector's rows unchanged", async () => {
    const result = await executeQuery(TYPE, CONFIG, { query: "ROWS" });

    expect(result).toMatchObject({ data: FIXTURE_ROWS, truncated: false });
  });

  it("hands the connector the query text as written and its named params", async () => {
    await executeQuery(TYPE, CONFIG, {
      query: "ROWS WHERE total > $min",
      params: { min: 15 },
    });

    expect(fixtureRuns.at(-1)).toMatchObject({
      query: "ROWS WHERE total > $min",
      params: { min: 15 },
    });
  });

  it("caps rows by consumption, never by rewriting the query", async () => {
    const result = await executeQuery(
      TYPE,
      { ...CONFIG, maxRows: 2 },
      { query: "ROWS" },
      // Asking for more than the connection allows runs at the connection's cap.
      { rowLimit: 100 },
    );

    expect(result).toMatchObject({
      data: FIXTURE_ROWS.slice(0, 2),
      truncated: true,
      rowLimit: 2,
    });
    expect(fixtureRuns.at(-1)).toMatchObject({
      query: "ROWS",
      config: { rowLimit: 2 },
    });
  });

  it("fails as an unknown connector once the fixture is not registered", async () => {
    unregisterConnector(TYPE);

    await expect(executeQuery(TYPE, CONFIG, { query: "ROWS" })).rejects.toThrow(
      `Unknown connector type: "${TYPE}"`,
    );
  });
});
