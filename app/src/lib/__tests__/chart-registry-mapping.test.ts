import { describe, it, expect } from "vitest";
import { chartRegistry, getChartConfig } from "../chart-registry";
import type { ColumnMapping } from "../chart-registry";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const RECORDS = [
  { category: "A", sales: 100, profit: 40 },
  { category: "B", sales: 200, profit: 80 },
  { category: "C", sales: 150, profit: 60 },
];

/** PostgreSQL-style wrapper: { records: [...] } */
const PG_WRAPPER = { records: RECORDS };

// ---------------------------------------------------------------------------
// Bar chart
// ---------------------------------------------------------------------------

describe("bar chart transformWithMapping", () => {
  const { transformWithMapping } = chartRegistry.bar;

  it("uses default columns when mapping is empty", () => {
    const result = transformWithMapping(RECORDS, {}) as { label: string; sales: number; profit: number }[];
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ label: "A", sales: 100, profit: 40 });
  });

  it("respects xAxis mapping", () => {
    const mapping: ColumnMapping = { xAxis: "category" };
    const result = transformWithMapping(RECORDS, mapping) as { label: string }[];
    expect(result[0].label).toBe("A");
  });

  it("respects yAxis mapping to single column", () => {
    const mapping: ColumnMapping = { xAxis: "category", yAxis: ["profit"] };
    const result = transformWithMapping(RECORDS, mapping) as Record<string, unknown>[];
    // Only 'profit' should appear as a value key, 'sales' must be absent
    expect(result[0]).toHaveProperty("profit", 40);
    expect(result[0]).not.toHaveProperty("sales");
  });

  it("falls back to all remaining columns when yAxis is empty array", () => {
    const mapping: ColumnMapping = { xAxis: "category", yAxis: [] };
    const result = transformWithMapping(RECORDS, mapping) as Record<string, unknown>[];
    // Falls back: sales and profit both present
    expect(result[0]).toHaveProperty("sales", 100);
    expect(result[0]).toHaveProperty("profit", 40);
  });

  it("falls back to first column as label when xAxis column not found", () => {
    const mapping: ColumnMapping = { xAxis: "nonexistent" };
    const result = transformWithMapping(RECORDS, mapping) as { label: string }[];
    // Falls back to first column: category
    expect(result[0].label).toBe("A");
  });

  it("returns empty array for empty data", () => {
    expect(transformWithMapping([], {})).toEqual([]);
  });

  it("returns empty array for single-column data", () => {
    const singleCol = [{ category: "A" }, { category: "B" }];
    expect(transformWithMapping(singleCol, {})).toEqual([]);
  });

  it("handles PostgreSQL { records } wrapper format", () => {
    const result = transformWithMapping(PG_WRAPPER, {}) as { label: string }[];
    expect(result).toHaveLength(3);
    expect(result[0].label).toBe("A");
  });

  it("filters out invalid yAxis columns and falls back when all are invalid", () => {
    // All yAxis columns are non-existent → fallback to all remaining columns
    const mapping: ColumnMapping = { xAxis: "category", yAxis: ["bad1", "bad2"] };
    const result = transformWithMapping(RECORDS, mapping) as Record<string, unknown>[];
    expect(result[0]).toHaveProperty("sales");
    expect(result[0]).toHaveProperty("profit");
  });

  it("uses only valid yAxis columns from a mixed valid/invalid list", () => {
    // One valid ("profit"), one invalid ("bad")
    const mapping: ColumnMapping = { xAxis: "category", yAxis: ["profit", "bad"] };
    const result = transformWithMapping(RECORDS, mapping) as Record<string, unknown>[];
    expect(result[0]).toHaveProperty("profit", 40);
    expect(result[0]).not.toHaveProperty("bad");
    expect(result[0]).not.toHaveProperty("sales");
  });

  it("coerces non-numeric values to 0 for value columns", () => {
    const data = [{ label: "X", score: "not-a-number" }];
    const result = transformWithMapping(data, {}) as Record<string, unknown>[];
    expect(result[0]).toHaveProperty("score", 0);
  });
});

// ---------------------------------------------------------------------------
// Line chart
// ---------------------------------------------------------------------------

describe("line chart transformWithMapping", () => {
  const { transformWithMapping } = chartRegistry.line;

  it("uses default columns when mapping is empty", () => {
    const result = transformWithMapping(RECORDS, {}) as { x: unknown; sales: number; profit: number }[];
    expect(result).toHaveLength(3);
    expect(result[0].x).toBe("A");
    expect(result[0]).toHaveProperty("sales", 100);
  });

  it("respects xAxis mapping", () => {
    const mapping: ColumnMapping = { xAxis: "sales" };
    const result = transformWithMapping(RECORDS, mapping) as { x: unknown }[];
    expect(result[0].x).toBe(100);
  });

  it("respects yAxis mapping to single series", () => {
    const mapping: ColumnMapping = { xAxis: "category", yAxis: ["sales"] };
    const result = transformWithMapping(RECORDS, mapping) as Record<string, unknown>[];
    expect(result[0]).toHaveProperty("sales", 100);
    expect(result[0]).not.toHaveProperty("profit");
  });

  it("falls back to default when yAxis contains non-existent column", () => {
    const mapping: ColumnMapping = { xAxis: "category", yAxis: ["nonexistent"] };
    const result = transformWithMapping(RECORDS, mapping) as Record<string, unknown>[];
    // yAxis filter removes non-existing column, fallback kicks in
    expect(result[0]).toHaveProperty("sales", 100);
    expect(result[0]).toHaveProperty("profit", 40);
  });

  it("falls back to all remaining columns when yAxis is empty array", () => {
    const mapping: ColumnMapping = { xAxis: "category", yAxis: [] };
    const result = transformWithMapping(RECORDS, mapping) as Record<string, unknown>[];
    expect(result[0]).toHaveProperty("sales", 100);
    expect(result[0]).toHaveProperty("profit", 40);
  });

  it("returns empty array for empty data", () => {
    expect(transformWithMapping([], {})).toEqual([]);
  });

  it("returns empty array for single-column data", () => {
    const singleCol = [{ x: 1 }, { x: 2 }];
    expect(transformWithMapping(singleCol, {})).toEqual([]);
  });

  it("handles PostgreSQL { records } wrapper format", () => {
    const result = transformWithMapping(PG_WRAPPER, {}) as { x: unknown }[];
    expect(result).toHaveLength(3);
    expect(result[0].x).toBe("A");
  });

  it("falls back to first column when xAxis column is not found", () => {
    const mapping: ColumnMapping = { xAxis: "missing" };
    const result = transformWithMapping(RECORDS, mapping) as { x: unknown }[];
    expect(result[0].x).toBe("A");
  });

  it("uses only valid yAxis columns from a mixed valid/invalid list", () => {
    const mapping: ColumnMapping = { xAxis: "category", yAxis: ["sales", "ghost"] };
    const result = transformWithMapping(RECORDS, mapping) as Record<string, unknown>[];
    expect(result[0]).toHaveProperty("sales", 100);
    expect(result[0]).not.toHaveProperty("ghost");
    expect(result[0]).not.toHaveProperty("profit");
  });

  it("coerces non-numeric series values to 0", () => {
    const data = [{ x: "Mon", revenue: "high" }];
    const result = transformWithMapping(data, {}) as Record<string, unknown>[];
    expect(result[0]).toHaveProperty("revenue", 0);
  });
});

// ---------------------------------------------------------------------------
// Pie chart
// ---------------------------------------------------------------------------

const PIE_RECORDS = [
  { segment: "Alpha", count: 50 },
  { segment: "Beta", count: 30 },
];

describe("pie chart transformWithMapping", () => {
  const { transformWithMapping } = chartRegistry.pie;

  it("uses default columns when mapping is empty", () => {
    const result = transformWithMapping(PIE_RECORDS, {}) as { name: string; value: number }[];
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "Alpha", value: 50 });
  });

  it("respects xAxis as name column", () => {
    const mapping: ColumnMapping = { xAxis: "segment" };
    const result = transformWithMapping(PIE_RECORDS, mapping) as { name: string }[];
    expect(result[0].name).toBe("Alpha");
  });

  it("respects yAxis[0] as value column", () => {
    const mapping: ColumnMapping = { xAxis: "segment", yAxis: ["count"] };
    const result = transformWithMapping(PIE_RECORDS, mapping) as { value: number }[];
    expect(result[0].value).toBe(50);
  });

  it("falls back to second column as value when yAxis not provided", () => {
    const result = transformWithMapping(PIE_RECORDS, {}) as { value: number }[];
    expect(result[0].value).toBe(50);
  });

  it("falls back when xAxis column not found", () => {
    const mapping: ColumnMapping = { xAxis: "nonexistent" };
    const result = transformWithMapping(PIE_RECORDS, mapping) as { name: string }[];
    // Falls back to first column: segment
    expect(result[0].name).toBe("Alpha");
  });

  it("falls back to second column when yAxis[0] column not found", () => {
    // yAxis[0] is "missing" which is not in the keys — fallback to second column "count"
    const mapping: ColumnMapping = { xAxis: "segment", yAxis: ["missing"] };
    const result = transformWithMapping(PIE_RECORDS, mapping) as { value: number }[];
    expect(result[0].value).toBe(50);
  });

  it("returns empty array for empty data", () => {
    expect(transformWithMapping([], {})).toEqual([]);
  });

  it("returns empty array for single-column data", () => {
    const singleCol = [{ segment: "Alpha" }];
    expect(transformWithMapping(singleCol, {})).toEqual([]);
  });

  it("handles PostgreSQL { records } wrapper format", () => {
    const pgData = { records: PIE_RECORDS };
    const result = transformWithMapping(pgData, {}) as { name: string; value: number }[];
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "Alpha", value: 50 });
  });

  it("coerces non-numeric value column to 0", () => {
    const data = [{ name: "X", value: "lots" }];
    const result = transformWithMapping(data, {}) as { value: number }[];
    expect(result[0].value).toBe(0);
  });

  it("converts name column to string", () => {
    const data = [{ id: 42, count: 10 }];
    const result = transformWithMapping(data, {}) as { name: string }[];
    expect(result[0].name).toBe("42");
  });
});

// ---------------------------------------------------------------------------
// Non-mapping chart types — transformWithMapping delegates to transform
// ---------------------------------------------------------------------------

describe("non-mapping chart types (table, single-value, graph, map, json, parameter-select)", () => {
  const tableRecords = [{ id: 1, name: "row1" }];

  it("table: transformWithMapping returns flat records", () => {
    const result = chartRegistry.table.transformWithMapping(tableRecords, {});
    expect(result).toEqual(tableRecords);
  });

  it("table: transformWithMapping handles PostgreSQL wrapper", () => {
    const result = chartRegistry.table.transformWithMapping({ records: tableRecords }, {});
    expect(result).toEqual(tableRecords);
  });

  it("table: transformWithMapping returns empty array for empty data", () => {
    expect(chartRegistry.table.transformWithMapping([], {})).toEqual([]);
  });

  it("single-value: transformWithMapping returns first value", () => {
    const result = chartRegistry["single-value"].transformWithMapping(
      [{ val: 42 }],
      {}
    );
    expect(result).toBe(42);
  });

  it("single-value: transformWithMapping returns 0 for empty data", () => {
    const result = chartRegistry["single-value"].transformWithMapping([], {});
    expect(result).toBe(0);
  });

  it("single-value: transformWithMapping returns raw number when data is a number", () => {
    const result = chartRegistry["single-value"].transformWithMapping(99, {});
    expect(result).toBe(99);
  });

  it("single-value: transformWithMapping returns raw string when data is a string", () => {
    const result = chartRegistry["single-value"].transformWithMapping("hello", {});
    expect(result).toBe("hello");
  });

  it("json: transformWithMapping returns records array", () => {
    const result = chartRegistry.json.transformWithMapping(tableRecords, {});
    expect(result).toEqual(tableRecords);
  });

  it("json: transformWithMapping returns original data when records array is empty", () => {
    // toRecords returns [] for a non-array non-records object; falls back to original
    const raw = { foo: "bar" };
    const result = chartRegistry.json.transformWithMapping(raw, {});
    expect(result).toEqual(raw);
  });

  it("json: transformWithMapping handles PostgreSQL wrapper", () => {
    const result = chartRegistry.json.transformWithMapping({ records: tableRecords }, {});
    expect(result).toEqual(tableRecords);
  });

  it("parameter-select: transformWithMapping returns first column values", () => {
    const result = chartRegistry["parameter-select"].transformWithMapping(
      [{ option: "A" }, { option: "B" }],
      {}
    );
    expect(result).toEqual(["A", "B"]);
  });

  it("parameter-select: transformWithMapping returns empty array for empty data", () => {
    expect(chartRegistry["parameter-select"].transformWithMapping([], {})).toEqual([]);
  });

  it("parameter-select: transformWithMapping filters out null/undefined values", () => {
    const result = chartRegistry["parameter-select"].transformWithMapping(
      [{ option: "A" }, { option: null }, { option: "B" }],
      {}
    ) as unknown[];
    // null values are filtered
    expect(result).not.toContain(null);
    expect(result).toContain("A");
    expect(result).toContain("B");
  });

  it("graph: transformWithMapping delegates to transformToGraphData", () => {
    // Empty data returns empty nodes/edges
    const result = chartRegistry.graph.transformWithMapping([], {}) as {
      nodes: unknown[];
      edges: unknown[];
    };
    expect(result).toHaveProperty("nodes");
    expect(result).toHaveProperty("edges");
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("graph: transformWithMapping with node data returns structured output", () => {
    const nodeRecords = [
      {
        n: {
          elementId: "4:abc:1",
          labels: ["Person"],
          properties: { name: "Alice" },
        },
      },
    ];
    const result = chartRegistry.graph.transformWithMapping(nodeRecords, {}) as {
      nodes: Record<string, unknown>[];
      edges: Record<string, unknown>[];
    };
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toHaveProperty("label", "Alice");
  });

  it("map: transformWithMapping delegates to transformToMapData", () => {
    const mapRecords = [
      { name: "Berlin", lat: 52.52, lng: 13.4 },
      { name: "London", lat: 51.5, lng: -0.12 },
    ];
    const result = chartRegistry.map.transformWithMapping(mapRecords, {}) as Record<string, unknown>[];
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("lat", 52.52);
    expect(result[0]).toHaveProperty("lng", 13.4);
    expect(result[0]).toHaveProperty("label", "Berlin");
  });

  it("map: transformWithMapping returns empty array when no lat/lng data", () => {
    const result = chartRegistry.map.transformWithMapping(
      [{ city: "Paris", population: 2000000 }],
      {}
    ) as unknown[];
    // No lat/lng keys by name heuristic — should return empty
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getChartConfig helper
// ---------------------------------------------------------------------------

describe("getChartConfig", () => {
  it("returns config for a valid chart type", () => {
    const config = getChartConfig("bar");
    expect(config).toBeDefined();
    expect(config?.type).toBe("bar");
    expect(config?.label).toBe("Bar Chart");
    expect(typeof config?.transform).toBe("function");
    expect(typeof config?.transformWithMapping).toBe("function");
  });

  it("returns config for all registered chart types", () => {
    const types = ["bar", "line", "pie", "table", "single-value", "graph", "map", "json", "parameter-select"];
    for (const type of types) {
      const config = getChartConfig(type);
      expect(config).toBeDefined();
      expect(config?.type).toBe(type);
    }
  });

  it("returns undefined for an unknown chart type", () => {
    expect(getChartConfig("unknown-type")).toBeUndefined();
    expect(getChartConfig("")).toBeUndefined();
  });

  it("label values match expected display names", () => {
    expect(getChartConfig("bar")?.label).toBe("Bar Chart");
    expect(getChartConfig("line")?.label).toBe("Line Chart");
    expect(getChartConfig("pie")?.label).toBe("Pie Chart");
    expect(getChartConfig("table")?.label).toBe("Data Table");
    expect(getChartConfig("single-value")?.label).toBe("Single Value");
    expect(getChartConfig("graph")?.label).toBe("Graph");
    expect(getChartConfig("map")?.label).toBe("Map");
    expect(getChartConfig("json")?.label).toBe("JSON Viewer");
    expect(getChartConfig("parameter-select")?.label).toBe("Parameter Selector");
  });
});

// ---------------------------------------------------------------------------
// toRecords — PostgreSQL wrapper path coverage via transforms
// ---------------------------------------------------------------------------

describe("toRecords — PostgreSQL wrapper format", () => {
  it("bar transform handles { records } wrapper", () => {
    const result = chartRegistry.bar.transform(PG_WRAPPER) as { label: string }[];
    expect(result).toHaveLength(3);
    expect(result[0].label).toBe("A");
  });

  it("line transform handles { records } wrapper", () => {
    const result = chartRegistry.line.transform(PG_WRAPPER) as { x: unknown }[];
    expect(result[0].x).toBe("A");
  });

  it("pie transform handles { records } wrapper", () => {
    const pgPie = { records: PIE_RECORDS };
    const result = chartRegistry.pie.transform(pgPie) as { name: string; value: number }[];
    expect(result[0]).toEqual({ name: "Alpha", value: 50 });
  });

  it("table transform handles { records } wrapper", () => {
    const result = chartRegistry.table.transform(PG_WRAPPER) as Record<string, unknown>[];
    expect(result).toEqual(RECORDS);
  });
});
