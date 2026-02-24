import { describe, it, expect } from "vitest";
import {
  getCompatibleChartTypes,
  getChartConfig,
  chartRegistry,
  buildPickerOptions,
} from "../chart-registry";
import type { ChartType, ConnectorType } from "../chart-registry";

// ---------------------------------------------------------------------------
// getCompatibleChartTypes
// ---------------------------------------------------------------------------
describe("getCompatibleChartTypes", () => {
  it("returns all chart types for neo4j", () => {
    const result = getCompatibleChartTypes("neo4j");
    const allTypes = Object.keys(chartRegistry) as ChartType[];
    for (const type of allTypes) {
      expect(result).toContain(type);
    }
  });

  it("returns all non-graph types for postgresql", () => {
    const result = getCompatibleChartTypes("postgresql");
    expect(result).toContain("bar");
    expect(result).toContain("line");
    expect(result).toContain("pie");
    expect(result).toContain("table");
    expect(result).toContain("single-value");
    expect(result).toContain("map");
    expect(result).toContain("json");
    expect(result).toContain("parameter-select");
  });

  it("excludes graph chart type for postgresql", () => {
    const result = getCompatibleChartTypes("postgresql");
    expect(result).not.toContain("graph");
  });

  it("includes graph chart type for neo4j", () => {
    const result = getCompatibleChartTypes("neo4j");
    expect(result).toContain("graph");
  });

  it("returns an empty array for an unknown connector type", () => {
    const result = getCompatibleChartTypes("mysql");
    expect(result).toEqual([]);
  });

  it("returns an empty array for an empty string", () => {
    const result = getCompatibleChartTypes("");
    expect(result).toEqual([]);
  });

  it("is case-sensitive: uppercase connector type returns empty array", () => {
    // ConnectorType is lowercase; typos/unknown strings must not silently
    // return data.
    expect(getCompatibleChartTypes("Neo4j")).toEqual([]);
    expect(getCompatibleChartTypes("PostgreSQL")).toEqual([]);
  });

  it("postgresql result excludes only neo4j-only chart types", () => {
    const allTypes = Object.keys(chartRegistry) as ChartType[];
    const neo4jOnlyCount = allTypes.filter(
      (t) => !chartRegistry[t].compatibleWith?.includes("postgresql")
    ).length;
    const result = getCompatibleChartTypes("postgresql");
    expect(result).toHaveLength(allTypes.length - neo4jOnlyCount);
  });

  it("neo4j result includes all registered chart types", () => {
    const allTypes = Object.keys(chartRegistry) as ChartType[];
    const result = getCompatibleChartTypes("neo4j");
    expect(result).toHaveLength(allTypes.length);
  });

  it("returned types are valid ChartType values", () => {
    const allTypes = new Set(Object.keys(chartRegistry));
    const neo4jTypes = getCompatibleChartTypes("neo4j");
    for (const type of neo4jTypes) {
      expect(allTypes.has(type)).toBe(true);
    }
  });

  it("returns an array (not undefined) for every known ConnectorType", () => {
    const known: ConnectorType[] = ["neo4j", "postgresql"];
    for (const ct of known) {
      const result = getCompatibleChartTypes(ct);
      expect(Array.isArray(result)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// chartRegistry compatibleWith field
// ---------------------------------------------------------------------------
describe("chartRegistry compatibleWith field", () => {
  it("graph is only compatible with neo4j", () => {
    expect(chartRegistry.graph.compatibleWith).toEqual(["neo4j"]);
  });

  it("bar is compatible with both neo4j and postgresql", () => {
    expect(chartRegistry.bar.compatibleWith).toContain("neo4j");
    expect(chartRegistry.bar.compatibleWith).toContain("postgresql");
  });

  it("every registry entry has a compatibleWith field", () => {
    for (const [type, cfg] of Object.entries(chartRegistry)) {
      expect(cfg.compatibleWith, `${type} missing compatibleWith`).toBeDefined();
      expect(Array.isArray(cfg.compatibleWith)).toBe(true);
    }
  });

  it("line is compatible with both connector types", () => {
    expect(chartRegistry.line.compatibleWith).toContain("neo4j");
    expect(chartRegistry.line.compatibleWith).toContain("postgresql");
  });

  it("pie is compatible with both connector types", () => {
    expect(chartRegistry.pie.compatibleWith).toContain("neo4j");
    expect(chartRegistry.pie.compatibleWith).toContain("postgresql");
  });

  it("table is compatible with both connector types", () => {
    expect(chartRegistry.table.compatibleWith).toContain("neo4j");
    expect(chartRegistry.table.compatibleWith).toContain("postgresql");
  });

  it("single-value is compatible with both connector types", () => {
    expect(chartRegistry["single-value"].compatibleWith).toContain("neo4j");
    expect(chartRegistry["single-value"].compatibleWith).toContain("postgresql");
  });

  it("map is compatible with both connector types", () => {
    expect(chartRegistry.map.compatibleWith).toContain("neo4j");
    expect(chartRegistry.map.compatibleWith).toContain("postgresql");
  });

  it("json is compatible with both connector types", () => {
    expect(chartRegistry.json.compatibleWith).toContain("neo4j");
    expect(chartRegistry.json.compatibleWith).toContain("postgresql");
  });

  it("parameter-select is compatible with both connector types", () => {
    expect(chartRegistry["parameter-select"].compatibleWith).toContain("neo4j");
    expect(chartRegistry["parameter-select"].compatibleWith).toContain("postgresql");
  });
});

// ---------------------------------------------------------------------------
// getChartConfig
// ---------------------------------------------------------------------------
describe("getChartConfig", () => {
  it("returns the config for a known type", () => {
    const cfg = getChartConfig("bar");
    expect(cfg).toBeDefined();
    expect(cfg?.type).toBe("bar");
    expect(cfg?.label).toBe("Bar Chart");
  });

  it("returns undefined for an unknown type", () => {
    expect(getChartConfig("unknown-type")).toBeUndefined();
  });

  it("returns the correct config for every registered type", () => {
    const types = Object.keys(chartRegistry) as ChartType[];
    for (const type of types) {
      const cfg = getChartConfig(type);
      expect(cfg).toBeDefined();
      expect(cfg?.type).toBe(type);
    }
  });

  it("returned config has a transform function", () => {
    const cfg = getChartConfig("bar");
    expect(typeof cfg?.transform).toBe("function");
  });

  it("returns undefined for empty string", () => {
    expect(getChartConfig("")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// chartRegistry — transform functions (via config.transform)
// These tests exercise the private transform helpers through the public API.
// ---------------------------------------------------------------------------

describe("bar transform", () => {
  const { transform } = chartRegistry.bar;

  it("converts array of records to bar data", () => {
    const data = [
      { category: "A", value: 10 },
      { category: "B", value: 20 },
    ];
    const result = transform(data) as Array<{ label: string; value: number }>;
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("A");
    expect(result[0].value).toBe(10);
    expect(result[1].label).toBe("B");
    expect(result[1].value).toBe(20);
  });

  it("handles postgresql { records } wrapper format", () => {
    const data = {
      records: [
        { category: "X", value: 5 },
        { category: "Y", value: 15 },
      ],
    };
    const result = transform(data) as Array<{ label: string; value: number }>;
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("X");
  });

  it("returns empty array for empty input", () => {
    expect(transform([])).toEqual([]);
  });

  it("returns empty array when records have only one column", () => {
    const data = [{ name: "A" }];
    expect(transform(data)).toEqual([]);
  });

  it("supports multiple numeric series columns", () => {
    const data = [{ cat: "X", s1: 1, s2: 2 }];
    const result = transform(data) as Array<Record<string, unknown>>;
    expect(result[0].label).toBe("X");
    expect(result[0].s1).toBe(1);
    expect(result[0].s2).toBe(2);
  });

  it("coerces non-numeric values to 0", () => {
    const data = [{ cat: "X", value: "not-a-number" }];
    const result = transform(data) as Array<{ value: number }>;
    expect(result[0].value).toBe(0);
  });

  it("returns empty array for null/undefined input", () => {
    expect(transform(null)).toEqual([]);
    expect(transform(undefined)).toEqual([]);
  });
});

describe("line transform", () => {
  const { transform } = chartRegistry.line;

  it("converts records to line data with x axis", () => {
    const data = [
      { month: "Jan", sales: 100 },
      { month: "Feb", sales: 200 },
    ];
    const result = transform(data) as Array<{ x: string; sales: number }>;
    expect(result).toHaveLength(2);
    expect(result[0].x).toBe("Jan");
    expect(result[0].sales).toBe(100);
  });

  it("handles postgresql { records } wrapper format", () => {
    const data = { records: [{ month: "Mar", sales: 150 }] };
    const result = transform(data) as Array<{ x: string }>;
    expect(result[0].x).toBe("Mar");
  });

  it("returns empty array for empty data", () => {
    expect(transform([])).toEqual([]);
  });

  it("returns empty array for single-column data", () => {
    expect(transform([{ x: 1 }])).toEqual([]);
  });

  it("coerces non-numeric series values to 0", () => {
    const data = [{ x: "Jan", y: "bad" }];
    const result = transform(data) as Array<{ y: number }>;
    expect(result[0].y).toBe(0);
  });
});

describe("pie transform", () => {
  const { transform } = chartRegistry.pie;

  it("converts records to {name, value} pairs", () => {
    const data = [
      { label: "Apples", count: 30 },
      { label: "Oranges", count: 70 },
    ];
    const result = transform(data) as Array<{ name: string; value: number }>;
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "Apples", value: 30 });
    expect(result[1]).toEqual({ name: "Oranges", value: 70 });
  });

  it("handles postgresql { records } wrapper format", () => {
    const data = { records: [{ label: "X", count: 5 }] };
    const result = transform(data) as Array<{ name: string; value: number }>;
    expect(result[0].name).toBe("X");
    expect(result[0].value).toBe(5);
  });

  it("returns empty array for empty input", () => {
    expect(transform([])).toEqual([]);
  });

  it("returns empty array for single-column data", () => {
    expect(transform([{ label: "A" }])).toEqual([]);
  });

  it("coerces non-numeric values to 0", () => {
    const data = [{ label: "X", count: "bad" }];
    const result = transform(data) as Array<{ value: number }>;
    expect(result[0].value).toBe(0);
  });

  it("stringifies null label values", () => {
    const data = [{ label: null, count: 10 }];
    const result = transform(data) as Array<{ name: string }>;
    expect(typeof result[0].name).toBe("string");
  });
});

describe("table transform", () => {
  const { transform } = chartRegistry.table;

  it("returns array format unchanged", () => {
    const data = [{ a: 1, b: 2 }];
    expect(transform(data)).toEqual(data);
  });

  it("unwraps { records } wrapper from postgresql", () => {
    const records = [{ a: 1 }];
    expect(transform({ records })).toEqual(records);
  });

  it("returns empty array for empty array input", () => {
    expect(transform([])).toEqual([]);
  });

  it("returns empty array for null", () => {
    expect(transform(null)).toEqual([]);
  });

  it("returns empty array for a plain object without records", () => {
    expect(transform({ foo: "bar" })).toEqual([]);
  });
});

describe("single-value transform", () => {
  const { transform } = chartRegistry["single-value"];

  it("extracts the first value from the first record", () => {
    const data = [{ count: 42 }];
    expect(transform(data)).toBe(42);
  });

  it("handles postgresql { records } wrapper format", () => {
    const data = { records: [{ total: 99 }] };
    expect(transform(data)).toBe(99);
  });

  it("passes through raw number directly if no records", () => {
    // toRecords([]) returns []; numeric primitive falls through
    expect(transform(7)).toBe(7);
  });

  it("passes through raw string directly if no records", () => {
    expect(transform("hello")).toBe("hello");
  });

  it("returns 0 for null/undefined", () => {
    expect(transform(null)).toBe(0);
    expect(transform(undefined)).toBe(0);
  });

  it("returns 0 for empty array", () => {
    expect(transform([])).toBe(0);
  });
});

describe("json transform", () => {
  const { transform } = chartRegistry.json;

  it("returns the records array for array input", () => {
    const data = [{ key: "value" }];
    expect(transform(data)).toEqual(data);
  });

  it("unwraps { records } wrapper and returns the records", () => {
    const records = [{ key: "value" }];
    expect(transform({ records })).toEqual(records);
  });

  it("returns original data when no records can be extracted", () => {
    // Non-array, non-{records} object falls back to returning data itself
    const data = { arbitrary: true };
    expect(transform(data)).toEqual(data);
  });

  it("returns empty array for empty array input", () => {
    expect(transform([])).toEqual([]);
  });
});

describe("parameter-select transform", () => {
  const { transform } = chartRegistry["parameter-select"];

  it("extracts first column values as options array", () => {
    const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(transform(data)).toEqual([1, 2, 3]);
  });

  it("filters out null and undefined values", () => {
    const data = [{ id: 1 }, { id: null }, { id: undefined }, { id: 4 }];
    const result = transform(data) as unknown[];
    expect(result).toEqual([1, 4]);
  });

  it("handles postgresql { records } wrapper format", () => {
    const data = { records: [{ status: "active" }, { status: "inactive" }] };
    expect(transform(data)).toEqual(["active", "inactive"]);
  });

  it("returns empty array for empty input", () => {
    expect(transform([])).toEqual([]);
  });

  it("returns empty array for record with no keys", () => {
    // toRecords returns one empty object — no firstKey
    expect(transform([{}])).toEqual([]);
  });
});

describe("map transform", () => {
  const { transform } = chartRegistry.map;

  it("extracts lat/lng from records using key name heuristics", () => {
    const data = [
      { name: "HQ", latitude: 51.5, longitude: -0.1 },
      { name: "Branch", lat: 48.8, lng: 2.3 },
    ];
    const result = transform(data) as Array<{
      id: string;
      lat: number;
      lng: number;
      label?: string;
    }>;
    expect(result).toHaveLength(2);
    expect(result[0].lat).toBeCloseTo(51.5);
    expect(result[0].lng).toBeCloseTo(-0.1);
    expect(result[0].label).toBe("HQ");
    expect(result[1].lat).toBeCloseTo(48.8);
    expect(result[1].lng).toBeCloseTo(2.3);
  });

  it("filters out records that have no numeric values", () => {
    const data = [
      { name: "text-only" },
      { lat: 10.0, lng: 20.0 },
    ];
    const result = transform(data) as Array<Record<string, unknown>>;
    // "text-only" row filtered out; lat/lng row kept
    expect(result).toHaveLength(1);
  });

  it("returns null for records that have numbers but no lat/lng keys", () => {
    // A record with a numeric column that doesn't match /lat/ or /lo?ng?/
    const data = [{ value: 42 }];
    const result = transform(data) as Array<Record<string, unknown> | null>;
    // filter keeps rows with numerics but addNode returns null; filter(Boolean) removes it
    expect(result.filter(Boolean)).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(transform([])).toEqual([]);
  });

  it("handles postgresql { records } wrapper format", () => {
    const data = {
      records: [{ name: "City", lat: 52.0, lon: 13.4 }],
    };
    const result = transform(data) as Array<{ lat: number }>;
    expect(result).toHaveLength(1);
    expect(result[0].lat).toBeCloseTo(52.0);
  });

  it("assigns sequential string ids", () => {
    const data = [
      { lat: 1.0, lng: 2.0 },
      { lat: 3.0, lng: 4.0 },
    ];
    const result = transform(data) as Array<{ id: string }>;
    expect(result[0].id).toBe("0");
    expect(result[1].id).toBe("1");
  });
});

describe("graph transform", () => {
  const { transform } = chartRegistry.graph;

  it("returns empty nodes and edges for empty input", () => {
    const result = transform([]) as { nodes: unknown[]; edges: unknown[] };
    expect(result).toEqual({ nodes: [], edges: [] });
  });

  it("extracts nodes from query results", () => {
    const data = [
      {
        n: {
          elementId: "node:0",
          labels: ["Person"],
          properties: { name: "Alice" },
        },
      },
    ];
    const result = transform(data) as {
      nodes: Array<{ id: string; label: unknown; labels: string[] }>;
      edges: unknown[];
    };
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("node:0");
    expect(result.nodes[0].label).toBe("Alice");
    expect(result.nodes[0].labels).toEqual(["Person"]);
    expect(result.edges).toHaveLength(0);
  });

  it("extracts relationships from query results", () => {
    const data = [
      {
        r: {
          elementId: "rel:0",
          type: "KNOWS",
          start: "node:0",
          end: "node:1",
          startNodeElementId: "node:0",
          endNodeElementId: "node:1",
          properties: { since: 2020 },
        },
      },
    ];
    const result = transform(data) as {
      nodes: unknown[];
      edges: Array<{ source: string; target: string; label: string }>;
    };
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].source).toBe("node:0");
    expect(result.edges[0].target).toBe("node:1");
    expect(result.edges[0].label).toBe("KNOWS");
  });

  it("deduplicates nodes that appear in multiple records", () => {
    const node = {
      elementId: "node:42",
      labels: ["City"],
      properties: { name: "London" },
    };
    const data = [{ n: node }, { n: node }];
    const result = transform(data) as { nodes: unknown[]; edges: unknown[] };
    expect(result.nodes).toHaveLength(1);
  });

  it("extracts nodes from path segments", () => {
    const startNode = {
      elementId: "node:1",
      labels: ["A"],
      properties: { name: "Start" },
    };
    const endNode = {
      elementId: "node:2",
      labels: ["B"],
      properties: { name: "End" },
    };
    const rel = {
      elementId: "rel:1",
      type: "CONNECTED",
      start: "node:1",
      end: "node:2",
      startNodeElementId: "node:1",
      endNodeElementId: "node:2",
      properties: {},
    };
    const path = {
      start: startNode,
      end: endNode,
      segments: [{ start: startNode, relationship: rel, end: endNode }],
    };
    const data = [{ p: path }];
    const result = transform(data) as {
      nodes: Array<{ id: string }>;
      edges: Array<{ label: string }>;
    };
    expect(result.nodes.length).toBeGreaterThanOrEqual(2);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
    expect(result.edges[0].label).toBe("CONNECTED");
  });

  it("falls back to title property when name is absent", () => {
    const data = [
      {
        n: {
          elementId: "node:5",
          labels: ["Doc"],
          properties: { title: "My Title" },
        },
      },
    ];
    const result = transform(data) as {
      nodes: Array<{ label: unknown }>;
      edges: unknown[];
    };
    expect(result.nodes[0].label).toBe("My Title");
  });

  it("falls back to labels[0] when name and title are absent", () => {
    const data = [
      {
        n: {
          elementId: "node:6",
          labels: ["Widget"],
          properties: {},
        },
      },
    ];
    const result = transform(data) as {
      nodes: Array<{ label: unknown }>;
      edges: unknown[];
    };
    expect(result.nodes[0].label).toBe("Widget");
  });

  it("handles Neo4j Integer {low, high} identity for node id", () => {
    const data = [
      {
        n: {
          identity: { low: 7, high: 0 },
          labels: ["N"],
          properties: { name: "Seven" },
        },
      },
    ];
    const result = transform(data) as {
      nodes: Array<{ id: string }>;
      edges: unknown[];
    };
    expect(result.nodes[0].id).toBe("7");
  });

  it("handles numeric identity for node id", () => {
    const data = [
      {
        n: {
          identity: 99,
          labels: ["Num"],
          properties: { name: "Ninety-nine" },
        },
      },
    ];
    const result = transform(data) as {
      nodes: Array<{ id: string }>;
      edges: unknown[];
    };
    expect(result.nodes[0].id).toBe("99");
  });

  it("skips non-object record values", () => {
    const data = [{ scalar: "just-a-string" }];
    const result = transform(data) as { nodes: unknown[]; edges: unknown[] };
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("handles postgresql { records } wrapper format (returns empty graph)", () => {
    // PostgreSQL data is tabular — graph transform will find no node/rel structures.
    const data = {
      records: [{ name: "row1" }, { name: "row2" }],
    };
    const result = transform(data) as { nodes: unknown[]; edges: unknown[] };
    expect(result).toHaveProperty("nodes");
    expect(result).toHaveProperty("edges");
  });

  it("deduplicates edges that appear multiple times", () => {
    const rel = {
      elementId: "rel:dup",
      type: "LINK",
      start: "node:a",
      end: "node:b",
      startNodeElementId: "node:a",
      endNodeElementId: "node:b",
      properties: {},
    };
    const data = [{ r: rel }, { r: rel }];
    const result = transform(data) as { nodes: unknown[]; edges: unknown[] };
    expect(result.edges).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// buildPickerOptions
// ---------------------------------------------------------------------------
describe("buildPickerOptions", () => {
  it("returns all chart types when connectorType is undefined", () => {
    const options = buildPickerOptions(undefined);
    const allTypes = Object.keys(chartRegistry);
    expect(options).toHaveLength(allTypes.length);
    for (const opt of options) {
      expect(opt).toHaveProperty("type");
      expect(opt).toHaveProperty("label");
    }
  });

  it("returns filtered options for postgresql (no graph)", () => {
    const options = buildPickerOptions("postgresql");
    const types = options.map((o) => o.type);
    expect(types).not.toContain("graph");
    expect(types).toContain("bar");
    expect(types).toContain("table");
  });

  it("returns all options for neo4j (includes graph)", () => {
    const options = buildPickerOptions("neo4j");
    const types = options.map((o) => o.type);
    expect(types).toContain("graph");
    expect(types).toContain("bar");
  });

  it("returns empty array for unknown connector type", () => {
    const options = buildPickerOptions("mysql");
    expect(options).toEqual([]);
  });

  it("each option has a matching label from the registry", () => {
    const options = buildPickerOptions("neo4j");
    for (const opt of options) {
      const cfg = chartRegistry[opt.type as ChartType];
      expect(opt.label).toBe(cfg.label);
    }
  });
});
