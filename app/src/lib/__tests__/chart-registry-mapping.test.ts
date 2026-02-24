import { describe, it, expect } from "vitest";
import { chartRegistry } from "../chart-registry";
import type { ColumnMapping } from "../chart-registry";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const RECORDS = [
  { category: "A", sales: 100, profit: 40 },
  { category: "B", sales: 200, profit: 80 },
  { category: "C", sales: 150, profit: 60 },
];

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

  it("returns empty array for empty data", () => {
    expect(transformWithMapping([], {})).toEqual([]);
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

  it("returns empty array for empty data", () => {
    expect(transformWithMapping([], {})).toEqual([]);
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

  it("single-value: transformWithMapping returns first value", () => {
    const result = chartRegistry["single-value"].transformWithMapping(
      [{ val: 42 }],
      {}
    );
    expect(result).toBe(42);
  });

  it("json: transformWithMapping returns records array", () => {
    const result = chartRegistry.json.transformWithMapping(tableRecords, {});
    expect(result).toEqual(tableRecords);
  });

  it("parameter-select: transformWithMapping returns first column values", () => {
    const result = chartRegistry["parameter-select"].transformWithMapping(
      [{ option: "A" }, { option: "B" }],
      {}
    );
    expect(result).toEqual(["A", "B"]);
  });
});
