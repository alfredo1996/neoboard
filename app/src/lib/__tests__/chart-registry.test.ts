import { describe, it, expect } from "vitest";
import {
  getCompatibleChartTypes,
  getChartConfig,
  chartRegistry,
  chartSupportsClickAction,
  chartSupportsStyling,
  getStylingTargets,
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

  it("handles numeric identity for node id", () => {
    const data = [
      {
        n: {
          identity: 7,
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

  it("handles larger numeric identity for node id", () => {
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
// Validators
// ---------------------------------------------------------------------------

describe("bar validate", () => {
  const { validate } = chartRegistry.bar;

  it("returns null for empty data", () => {
    expect(validate!([])).toBeNull();
  });

  it("returns null for correctly shaped data (≥2 columns)", () => {
    expect(validate!([{ cat: "A", value: 10 }])).toBeNull();
  });

  it("returns error for 1-column data", () => {
    const err = validate!([{ name: "A" }]);
    expect(err).toBeTruthy();
    expect(err).toContain("1 column");
    expect(err).toContain("Bar chart");
  });
});

describe("line validate", () => {
  const { validate } = chartRegistry.line;

  it("returns null for empty data", () => {
    expect(validate!([])).toBeNull();
  });

  it("returns null for 2+ columns", () => {
    expect(validate!([{ x: "Jan", y: 100 }])).toBeNull();
  });

  it("returns error for 1-column data", () => {
    const err = validate!([{ x: 1 }]);
    expect(err).toBeTruthy();
    expect(err).toContain("1 column");
    expect(err).toContain("Line chart");
  });
});

describe("pie validate", () => {
  const { validate } = chartRegistry.pie;

  it("returns null for empty data", () => {
    expect(validate!([])).toBeNull();
  });

  it("returns null for 2-column data", () => {
    expect(validate!([{ name: "A", value: 10 }])).toBeNull();
  });

  it("returns error for 1-column data", () => {
    const err = validate!([{ name: "A" }]);
    expect(err).toBeTruthy();
    expect(err).toContain("1 column");
    expect(err).toContain("Pie chart");
  });
});

describe("single-value validate", () => {
  const { validate } = chartRegistry["single-value"];

  it("returns null for empty data", () => {
    expect(validate!([])).toBeNull();
  });

  it("returns null for data with at least one value column", () => {
    expect(validate!([{ count: 42 }])).toBeNull();
  });

  it("returns error for record with no value columns", () => {
    const err = validate!([{}]);
    expect(err).toBeTruthy();
    expect(err).toContain("Single value");
  });
});

describe("graph validate", () => {
  const { validate } = chartRegistry.graph;

  it("returns null for empty data", () => {
    expect(validate!([])).toBeNull();
  });

  it("returns null when nodes are present", () => {
    const data = [{ n: { elementId: "1", labels: ["X"], properties: {} } }];
    expect(validate!(data)).toBeNull();
  });

  it("returns error for tabular data with no graph structures", () => {
    const data = [{ name: "Alice", age: 30 }];
    const err = validate!(data);
    expect(err).toBeTruthy();
    expect(err).toContain("Graph chart");
  });
});

describe("map validate", () => {
  const { validate } = chartRegistry.map;

  it("returns null for empty data", () => {
    expect(validate!([])).toBeNull();
  });

  it("returns null when lat/lng columns exist", () => {
    expect(validate!([{ name: "City", lat: 1, lng: 2 }])).toBeNull();
  });

  it("returns error when no lat/lng columns found", () => {
    const data = [{ name: "City", value: 42 }];
    const err = validate!(data);
    expect(err).toBeTruthy();
    expect(err).toContain("Map chart");
    expect(err).toContain("lat");
  });
});

// ---------------------------------------------------------------------------
// chartSupportsClickAction
// ---------------------------------------------------------------------------
describe("chartSupportsClickAction", () => {
  it("returns true for bar", () => {
    expect(chartSupportsClickAction("bar")).toBe(true);
  });

  it("returns true for line", () => {
    expect(chartSupportsClickAction("line")).toBe(true);
  });

  it("returns true for pie", () => {
    expect(chartSupportsClickAction("pie")).toBe(true);
  });

  it("returns true for table", () => {
    expect(chartSupportsClickAction("table")).toBe(true);
  });

  it("returns true for graph", () => {
    expect(chartSupportsClickAction("graph")).toBe(true);
  });

  it("returns true for map", () => {
    expect(chartSupportsClickAction("map")).toBe(true);
  });

  it("returns false for single-value", () => {
    expect(chartSupportsClickAction("single-value")).toBe(false);
  });

  it("returns false for json", () => {
    expect(chartSupportsClickAction("json")).toBe(false);
  });

  it("returns false for parameter-select", () => {
    expect(chartSupportsClickAction("parameter-select")).toBe(false);
  });

  it("returns false for unknown chart type", () => {
    expect(chartSupportsClickAction("unknown-type")).toBe(false);
  });
});

describe("charts without validators", () => {
  it("table has no validate function", () => {
    expect(chartRegistry.table.validate).toBeUndefined();
  });

  it("json has no validate function", () => {
    expect(chartRegistry.json.validate).toBeUndefined();
  });

  it("parameter-select has no validate function", () => {
    expect(chartRegistry["parameter-select"].validate).toBeUndefined();
  });

  it("form has no validate function", () => {
    expect(chartRegistry.form.validate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// form chart type
// ---------------------------------------------------------------------------
describe("form chart type", () => {
  it("is registered in chartRegistry", () => {
    expect(chartRegistry.form).toBeDefined();
    expect(chartRegistry.form.type).toBe("form");
    expect(chartRegistry.form.label).toBe("Form");
  });

  it("is compatible with both neo4j and postgresql", () => {
    expect(chartRegistry.form.compatibleWith).toContain("neo4j");
    expect(chartRegistry.form.compatibleWith).toContain("postgresql");
  });

  it("transform returns empty array (form has no data transform)", () => {
    expect(chartRegistry.form.transform([{ a: 1 }])).toEqual([]);
    expect(chartRegistry.form.transform([])).toEqual([]);
    expect(chartRegistry.form.transform(null)).toEqual([]);
  });

  it("transformWithMapping returns empty array", () => {
    expect(chartRegistry.form.transformWithMapping([{ a: 1 }], {})).toEqual([]);
  });

  it("is included in neo4j compatible chart types", () => {
    const result = getCompatibleChartTypes("neo4j");
    expect(result).toContain("form");
  });

  it("is included in postgresql compatible chart types", () => {
    const result = getCompatibleChartTypes("postgresql");
    expect(result).toContain("form");
  });

  it("getChartConfig returns config for form", () => {
    const cfg = getChartConfig("form");
    expect(cfg).toBeDefined();
    expect(cfg?.type).toBe("form");
  });
});

describe("bar transform normalizes date labels", () => {
  const { transform } = chartRegistry.bar;

  it("converts Date objects to formatted strings in labels", () => {
    const data = [{ date: new Date("2024-01-15T10:30:00Z"), value: 42 }];
    const result = transform(data) as Array<{ label: string }>;
    expect(result[0].label).toContain("2024-01-15");
    expect(result[0].label).not.toContain("[object Object]");
  });

  it("converts number to string in labels", () => {
    const data = [{ id: 7, value: 10 }];
    const result = transform(data) as Array<{ label: string }>;
    expect(result[0].label).toBe("7");
  });
});

describe("transformToGraphData handles native number properties", () => {
  const { transform } = chartRegistry.graph;

  it("passes through native number properties in nodes", () => {
    const data = [
      {
        n: {
          labels: ["Person"],
          properties: { age: 30, score: 1000, name: "Alice" },
          identity: 1,
          elementId: "node:1",
        },
      },
    ];
    const result = transform(data) as { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] };
    expect(result.nodes).toHaveLength(1);
    const props = result.nodes[0].properties as Record<string, unknown>;
    expect(props.age).toBe(30);
    expect(props.score).toBe(1000);
    expect(props.name).toBe("Alice");
  });

  it("passes through native number properties in edges", () => {
    const data = [
      {
        r: {
          type: "ACTED_IN",
          start: 1,
          end: 2,
          properties: { weight: 5 },
          identity: 10,
          elementId: "rel:10",
          startNodeElementId: "node:1",
          endNodeElementId: "node:2",
        },
      },
    ];
    const result = transform(data) as { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] };
    expect(result.edges).toHaveLength(1);
    const props = result.edges[0].properties as Record<string, unknown>;
    expect(props.weight).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// chartSupportsStyling
// ---------------------------------------------------------------------------
describe("chartSupportsStyling", () => {
  it.each(["bar", "line", "pie", "single-value", "table"] as const)(
    "returns true for %s",
    (type) => {
      expect(chartSupportsStyling(type)).toBe(true);
    },
  );

  it.each(["graph", "map", "json", "parameter-select", "form"] as const)(
    "returns false for %s",
    (type) => {
      expect(chartSupportsStyling(type)).toBe(false);
    },
  );

  it("returns false for unknown type", () => {
    expect(chartSupportsStyling("unknown")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getStylingTargets
// ---------------------------------------------------------------------------
describe("getStylingTargets", () => {
  it("returns [color] for bar", () => {
    const targets = getStylingTargets("bar");
    expect(targets).toEqual([{ value: "color", label: "Color" }]);
  });

  it("returns [color] for line", () => {
    expect(getStylingTargets("line")).toEqual([{ value: "color", label: "Color" }]);
  });

  it("returns [color] for pie", () => {
    expect(getStylingTargets("pie")).toEqual([{ value: "color", label: "Color" }]);
  });

  it("returns color + backgroundColor for single-value", () => {
    const targets = getStylingTargets("single-value");
    expect(targets).toHaveLength(2);
    expect(targets).toContainEqual({ value: "color", label: "Text Color" });
    expect(targets).toContainEqual({ value: "backgroundColor", label: "Background Color" });
  });

  it("returns backgroundColor + textColor for table", () => {
    const targets = getStylingTargets("table");
    expect(targets).toHaveLength(2);
    expect(targets).toContainEqual({ value: "backgroundColor", label: "Background Color" });
    expect(targets).toContainEqual({ value: "textColor", label: "Text Color" });
  });

  it("returns empty array for graph", () => {
    expect(getStylingTargets("graph")).toEqual([]);
  });

  it("returns empty array for unknown type", () => {
    expect(getStylingTargets("unknown")).toEqual([]);
  });
});

describe("line transform normalizes date x-axis", () => {
  const { transform } = chartRegistry.line;

  it("converts Date objects to formatted strings in x-axis", () => {
    const data = [{ date: new Date("2024-06-01T00:00:00Z"), revenue: 100 }];
    const result = transform(data) as Array<{ x: unknown }>;
    expect(typeof result[0].x).toBe("string");
    expect(String(result[0].x)).toContain("2024-06-01");
  });
});

// ---------------------------------------------------------------------------
// markdown chart type
// ---------------------------------------------------------------------------
describe("markdown chart type", () => {
  it("is registered in chartRegistry", () => {
    expect(chartRegistry.markdown).toBeDefined();
    expect(chartRegistry.markdown.type).toBe("markdown");
    expect(chartRegistry.markdown.label).toBe("Markdown");
  });

  it("is compatible with both neo4j and postgresql", () => {
    expect(chartRegistry.markdown.compatibleWith).toContain("neo4j");
    expect(chartRegistry.markdown.compatibleWith).toContain("postgresql");
  });

  it("transform returns null (content-only widget)", () => {
    expect(chartRegistry.markdown.transform([])).toBeNull();
    expect(chartRegistry.markdown.transform([{ a: 1 }])).toBeNull();
  });

  it("transformWithMapping returns null", () => {
    expect(chartRegistry.markdown.transformWithMapping([{ a: 1 }], {})).toBeNull();
  });

  it("supportsClickAction is false", () => {
    expect(chartSupportsClickAction("markdown")).toBe(false);
  });

  it("supportsStyling is false", () => {
    expect(chartSupportsStyling("markdown")).toBe(false);
  });

  it("getStylingTargets returns empty array", () => {
    expect(getStylingTargets("markdown")).toEqual([]);
  });

  it("is included in compatible chart types for both connectors", () => {
    expect(getCompatibleChartTypes("neo4j")).toContain("markdown");
    expect(getCompatibleChartTypes("postgresql")).toContain("markdown");
  });
});

// ---------------------------------------------------------------------------
// iframe chart type
// ---------------------------------------------------------------------------
describe("iframe chart type", () => {
  it("is registered in chartRegistry", () => {
    expect(chartRegistry.iframe).toBeDefined();
    expect(chartRegistry.iframe.type).toBe("iframe");
    expect(chartRegistry.iframe.label).toBe("iFrame");
  });

  it("is compatible with both neo4j and postgresql", () => {
    expect(chartRegistry.iframe.compatibleWith).toContain("neo4j");
    expect(chartRegistry.iframe.compatibleWith).toContain("postgresql");
  });

  it("transform returns null (content-only widget)", () => {
    expect(chartRegistry.iframe.transform([])).toBeNull();
    expect(chartRegistry.iframe.transform([{ a: 1 }])).toBeNull();
  });

  it("transformWithMapping returns null", () => {
    expect(chartRegistry.iframe.transformWithMapping([{ a: 1 }], {})).toBeNull();
  });

  it("supportsClickAction is false", () => {
    expect(chartSupportsClickAction("iframe")).toBe(false);
  });

  it("supportsStyling is false", () => {
    expect(chartSupportsStyling("iframe")).toBe(false);
  });

  it("getStylingTargets returns empty array", () => {
    expect(getStylingTargets("iframe")).toEqual([]);
  });

  it("is included in compatible chart types for both connectors", () => {
    expect(getCompatibleChartTypes("neo4j")).toContain("iframe");
    expect(getCompatibleChartTypes("postgresql")).toContain("iframe");
  });
});

// ---------------------------------------------------------------------------
// gauge chart type
// ---------------------------------------------------------------------------
describe("gauge chart type", () => {
  it("is registered in chartRegistry", () => {
    expect(chartRegistry.gauge).toBeDefined();
    expect(chartRegistry.gauge.type).toBe("gauge");
    expect(chartRegistry.gauge.label).toBe("Gauge");
  });

  it("is compatible with both neo4j and postgresql", () => {
    expect(chartRegistry.gauge.compatibleWith).toContain("neo4j");
    expect(chartRegistry.gauge.compatibleWith).toContain("postgresql");
  });

  it("supportsClickAction is true", () => {
    expect(chartSupportsClickAction("gauge")).toBe(true);
  });

  it("supportsStyling is true", () => {
    expect(chartSupportsStyling("gauge")).toBe(true);
  });

  it("getStylingTargets returns Gauge Color target", () => {
    expect(getStylingTargets("gauge")).toEqual([{ value: "color", label: "Gauge Color" }]);
  });

  it("is included in compatible chart types for both connectors", () => {
    expect(getCompatibleChartTypes("neo4j")).toContain("gauge");
    expect(getCompatibleChartTypes("postgresql")).toContain("gauge");
  });
});

describe("gauge transform", () => {
  const { transform } = chartRegistry.gauge;

  it("returns single { value, name } from first record", () => {
    const data = [{ value: 75, name: "Score" }];
    const result = transform(data) as Array<{ value: number; name: string }>;
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(75);
    expect(result[0].name).toBe("Score");
  });

  it("extracts value from first column, name from second column", () => {
    const data = [{ score: 60, label: "CPU" }];
    const result = transform(data) as Array<{ value: number; name: string }>;
    expect(result[0].value).toBe(60);
    expect(result[0].name).toBe("CPU");
  });

  it("uses first column as value when only one column exists", () => {
    const data = [{ score: 80 }];
    const result = transform(data) as Array<{ value: number; name: string }>;
    expect(result[0].value).toBe(80);
  });

  it("coerces non-numeric values to 0", () => {
    const data = [{ value: "bad", name: "Test" }];
    const result = transform(data) as Array<{ value: number }>;
    expect(result[0].value).toBe(0);
  });

  it("returns empty array for empty input", () => {
    expect(transform([])).toEqual([]);
  });

  it("returns empty array for null/undefined input", () => {
    expect(transform(null)).toEqual([]);
    expect(transform(undefined)).toEqual([]);
  });

  it("handles postgresql { records } wrapper format", () => {
    const data = { records: [{ value: 42, name: "Load" }] };
    const result = transform(data) as Array<{ value: number; name: string }>;
    expect(result[0].value).toBe(42);
    expect(result[0].name).toBe("Load");
  });

  it("transformWithMapping returns same result as transform", () => {
    const data = [{ value: 50, name: "Test" }];
    const result = chartRegistry.gauge.transformWithMapping(data, {});
    expect(result).toEqual(transform(data));
  });
});

// ---------------------------------------------------------------------------
// sankey chart type
// ---------------------------------------------------------------------------
describe("sankey chart type", () => {
  it("is registered in chartRegistry", () => {
    expect(chartRegistry.sankey).toBeDefined();
    expect(chartRegistry.sankey.type).toBe("sankey");
    expect(chartRegistry.sankey.label).toBe("Sankey");
  });

  it("is compatible with both neo4j and postgresql", () => {
    expect(chartRegistry.sankey.compatibleWith).toContain("neo4j");
    expect(chartRegistry.sankey.compatibleWith).toContain("postgresql");
  });

  it("supportsClickAction is true", () => {
    expect(chartSupportsClickAction("sankey")).toBe(true);
  });

  it("supportsStyling is true", () => {
    expect(chartSupportsStyling("sankey")).toBe(true);
  });

  it("getStylingTargets returns Link Color target", () => {
    expect(getStylingTargets("sankey")).toEqual([{ value: "color", label: "Link Color" }]);
  });

  it("is included in compatible chart types for both connectors", () => {
    expect(getCompatibleChartTypes("neo4j")).toContain("sankey");
    expect(getCompatibleChartTypes("postgresql")).toContain("sankey");
  });
});

describe("sankey transform", () => {
  const { transform } = chartRegistry.sankey;

  it("produces { nodes, links } from source/target/value records", () => {
    const data = [
      { source: "A", target: "B", value: 10 },
      { source: "B", target: "C", value: 5 },
    ];
    const result = transform(data) as { nodes: Array<{ name: string }>; links: Array<{ source: string; target: string; value: number }> };
    expect(result.nodes).toBeDefined();
    expect(result.links).toBeDefined();
    expect(result.links).toHaveLength(2);
    expect(result.links[0].source).toBe("A");
    expect(result.links[0].target).toBe("B");
    expect(result.links[0].value).toBe(10);
  });

  it("deduplicates nodes from source and target columns", () => {
    const data = [
      { source: "A", target: "B", value: 10 },
      { source: "A", target: "C", value: 5 },
    ];
    const result = transform(data) as { nodes: Array<{ name: string }>; links: unknown[] };
    const nodeNames = result.nodes.map((n) => n.name);
    expect(nodeNames.filter((n) => n === "A")).toHaveLength(1);
    expect(nodeNames).toContain("B");
    expect(nodeNames).toContain("C");
  });

  it("returns empty { nodes: [], links: [] } for empty input", () => {
    const result = transform([]) as { nodes: unknown[]; links: unknown[] };
    expect(result.nodes).toEqual([]);
    expect(result.links).toEqual([]);
  });

  it("returns empty for null/undefined", () => {
    const r1 = transform(null) as { nodes: unknown[]; links: unknown[] };
    expect(r1.nodes).toEqual([]);
    expect(r1.links).toEqual([]);
  });

  it("handles postgresql { records } wrapper format", () => {
    const data = { records: [{ source: "X", target: "Y", value: 3 }] };
    const result = transform(data) as { nodes: unknown[]; links: Array<{ value: number }> };
    expect(result.links[0].value).toBe(3);
  });

  it("coerces non-numeric values to 0", () => {
    const data = [{ source: "A", target: "B", value: "bad" }];
    const result = transform(data) as { links: Array<{ value: number }> };
    expect(result.links[0].value).toBe(0);
  });

  it("transformWithMapping returns same result as transform", () => {
    const data = [{ source: "A", target: "B", value: 10 }];
    const result = chartRegistry.sankey.transformWithMapping(data, {});
    expect(result).toEqual(transform(data));
  });
});

// ---------------------------------------------------------------------------
// sunburst chart type
// ---------------------------------------------------------------------------
describe("sunburst chart type", () => {
  it("is registered in chartRegistry", () => {
    expect(chartRegistry.sunburst).toBeDefined();
    expect(chartRegistry.sunburst.type).toBe("sunburst");
    expect(chartRegistry.sunburst.label).toBe("Sunburst");
  });

  it("is compatible with both neo4j and postgresql", () => {
    expect(chartRegistry.sunburst.compatibleWith).toContain("neo4j");
    expect(chartRegistry.sunburst.compatibleWith).toContain("postgresql");
  });

  it("supportsClickAction is true", () => {
    expect(chartSupportsClickAction("sunburst")).toBe(true);
  });

  it("supportsStyling is true", () => {
    expect(chartSupportsStyling("sunburst")).toBe(true);
  });

  it("getStylingTargets returns Segment Color target", () => {
    expect(getStylingTargets("sunburst")).toEqual([{ value: "color", label: "Segment Color" }]);
  });

  it("is included in compatible chart types for both connectors", () => {
    expect(getCompatibleChartTypes("neo4j")).toContain("sunburst");
    expect(getCompatibleChartTypes("postgresql")).toContain("sunburst");
  });
});

describe("sunburst transform", () => {
  const { transform } = chartRegistry.sunburst;

  it("passes through hierarchical data unchanged", () => {
    const data = [{ name: "Root", value: 100, children: [{ name: "Child", value: 50 }] }];
    const result = transform(data) as Array<{ name: string; value: number; children?: unknown[] }>;
    expect(result[0].name).toBe("Root");
    expect(result[0].value).toBe(100);
    expect(result[0].children).toHaveLength(1);
  });

  it("builds hierarchy from flat records with parent column", () => {
    const data = [
      { name: "root", parent: "", value: 0 },
      { name: "A", parent: "root", value: 10 },
      { name: "B", parent: "root", value: 20 },
    ];
    const result = transform(data) as Array<{ name: string; children?: Array<{ name: string }> }>;
    // Top-level nodes (no parent or parent is "")
    expect(result.some((r) => r.name === "root")).toBe(true);
    const rootNode = result.find((r) => r.name === "root");
    expect(rootNode?.children).toBeDefined();
    expect(rootNode?.children?.some((c) => c.name === "A")).toBe(true);
    expect(rootNode?.children?.some((c) => c.name === "B")).toBe(true);
  });

  it("returns flat array when no parent column or children key", () => {
    const data = [
      { name: "A", value: 10 },
      { name: "B", value: 20 },
    ];
    const result = transform(data) as Array<{ name: string; value: number }>;
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("A");
  });

  it("returns empty array for empty input", () => {
    expect(transform([])).toEqual([]);
  });

  it("returns empty array for null input", () => {
    expect(transform(null)).toEqual([]);
  });

  it("handles postgresql { records } wrapper format", () => {
    const data = { records: [{ name: "X", value: 5 }] };
    const result = transform(data) as Array<{ name: string }>;
    expect(result[0].name).toBe("X");
  });

  it("transformWithMapping returns same result as transform", () => {
    const data = [{ name: "A", value: 10 }];
    const result = chartRegistry.sunburst.transformWithMapping(data, {});
    expect(result).toEqual(transform(data));
  });
});

// ---------------------------------------------------------------------------
// radar chart type
// ---------------------------------------------------------------------------
describe("radar chart type", () => {
  it("is registered in chartRegistry", () => {
    expect(chartRegistry.radar).toBeDefined();
    expect(chartRegistry.radar.type).toBe("radar");
    expect(chartRegistry.radar.label).toBe("Radar");
  });

  it("is compatible with both neo4j and postgresql", () => {
    expect(chartRegistry.radar.compatibleWith).toContain("neo4j");
    expect(chartRegistry.radar.compatibleWith).toContain("postgresql");
  });

  it("supportsClickAction is true", () => {
    expect(chartSupportsClickAction("radar")).toBe(true);
  });

  it("supportsStyling is true", () => {
    expect(chartSupportsStyling("radar")).toBe(true);
  });

  it("getStylingTargets returns Area Color target", () => {
    expect(getStylingTargets("radar")).toEqual([{ value: "color", label: "Area Color" }]);
  });

  it("is included in compatible chart types for both connectors", () => {
    expect(getCompatibleChartTypes("neo4j")).toContain("radar");
    expect(getCompatibleChartTypes("postgresql")).toContain("radar");
  });
});

describe("radar transform", () => {
  const { transform } = chartRegistry.radar;

  it("produces { indicators, series } from indicator/value/max records", () => {
    const data = [
      { indicator: "Speed", value: 80, max: 100 },
      { indicator: "Strength", value: 60, max: 100 },
      { indicator: "Agility", value: 90, max: 100 },
    ];
    const result = transform(data) as { indicators: Array<{ name: string; max: number }>; series: Array<{ name: string; values: number[] }> };
    expect(result.indicators).toBeDefined();
    expect(result.series).toBeDefined();
    expect(result.indicators).toHaveLength(3);
    expect(result.indicators[0].name).toBe("Speed");
    expect(result.indicators[0].max).toBe(100);
    expect(result.series[0].values).toHaveLength(3);
    expect(result.series[0].values[0]).toBe(80);
  });

  it("groups multiple series by seriesName column when present", () => {
    const data = [
      { indicator: "Speed", value: 80, max: 100, series: "Player A" },
      { indicator: "Strength", value: 60, max: 100, series: "Player A" },
      { indicator: "Speed", value: 70, max: 100, series: "Player B" },
      { indicator: "Strength", value: 85, max: 100, series: "Player B" },
    ];
    const result = transform(data) as { indicators: unknown[]; series: Array<{ name: string; values: number[] }> };
    expect(result.series).toHaveLength(2);
    expect(result.series.map((s) => s.name)).toContain("Player A");
    expect(result.series.map((s) => s.name)).toContain("Player B");
  });

  it("returns empty { indicators: [], series: [] } for empty input", () => {
    const result = transform([]) as { indicators: unknown[]; series: unknown[] };
    expect(result.indicators).toEqual([]);
    expect(result.series).toEqual([]);
  });

  it("returns empty for null input", () => {
    const r = transform(null) as { indicators: unknown[]; series: unknown[] };
    expect(r.indicators).toEqual([]);
    expect(r.series).toEqual([]);
  });

  it("handles postgresql { records } wrapper format", () => {
    const data = { records: [{ indicator: "X", value: 50, max: 100 }] };
    const result = transform(data) as { indicators: Array<{ name: string }>; series: unknown[] };
    expect(result.indicators[0].name).toBe("X");
  });

  it("defaults max to 100 when max column is missing", () => {
    const data = [{ indicator: "Speed", value: 80 }];
    const result = transform(data) as { indicators: Array<{ name: string; max: number }>; series: unknown[] };
    expect(result.indicators[0].max).toBe(100);
  });

  it("handles flat tabular data without indicator column (uses column names as indicators)", () => {
    const data = [{ Speed: 80, Strength: 60, Agility: 90 }];
    const result = transform(data) as { indicators: Array<{ name: string }>; series: Array<{ values: number[] }> };
    expect(result.indicators.map((i) => i.name)).toContain("Speed");
    expect(result.indicators.map((i) => i.name)).toContain("Strength");
    expect(result.series[0].values).toHaveLength(3);
  });

  it("transformWithMapping returns same result as transform", () => {
    const data = [{ indicator: "Speed", value: 80, max: 100 }];
    const result = chartRegistry.radar.transformWithMapping(data, {});
    expect(result).toEqual(transform(data));
  });
});

// ---------------------------------------------------------------------------
// treemap chart type
// ---------------------------------------------------------------------------
describe("treemap chart type", () => {
  it("is registered in chartRegistry", () => {
    expect(chartRegistry.treemap).toBeDefined();
    expect(chartRegistry.treemap.type).toBe("treemap");
    expect(chartRegistry.treemap.label).toBe("Treemap");
  });

  it("is compatible with both neo4j and postgresql", () => {
    expect(chartRegistry.treemap.compatibleWith).toContain("neo4j");
    expect(chartRegistry.treemap.compatibleWith).toContain("postgresql");
  });

  it("supportsClickAction is true", () => {
    expect(chartSupportsClickAction("treemap")).toBe(true);
  });

  it("supportsStyling is true", () => {
    expect(chartSupportsStyling("treemap")).toBe(true);
  });

  it("getStylingTargets returns Block Color target", () => {
    expect(getStylingTargets("treemap")).toEqual([{ value: "color", label: "Block Color" }]);
  });

  it("is included in compatible chart types for both connectors", () => {
    expect(getCompatibleChartTypes("neo4j")).toContain("treemap");
    expect(getCompatibleChartTypes("postgresql")).toContain("treemap");
  });
});

describe("treemap transform", () => {
  const { transform } = chartRegistry.treemap;

  it("converts flat records to { name, value } items", () => {
    const data = [
      { name: "A", value: 10 },
      { name: "B", value: 30 },
    ];
    const result = transform(data) as Array<{ name: string; value: number }>;
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("A");
    expect(result[0].value).toBe(10);
    expect(result[1].name).toBe("B");
    expect(result[1].value).toBe(30);
  });

  it("passes through hierarchical data with children", () => {
    const data = [
      { name: "Root", value: 100, children: [{ name: "Child", value: 50 }] },
    ];
    const result = transform(data) as Array<{ name: string; value: number; children?: unknown[] }>;
    expect(result[0].children).toHaveLength(1);
  });

  it("builds hierarchy from flat records with parent column", () => {
    const data = [
      { name: "root", parent: "", value: 0 },
      { name: "A", parent: "root", value: 10 },
    ];
    const result = transform(data) as Array<{ name: string; children?: unknown[] }>;
    const rootNode = result.find((r) => r.name === "root");
    expect(rootNode?.children).toBeDefined();
  });

  it("returns empty array for empty input", () => {
    expect(transform([])).toEqual([]);
  });

  it("returns empty array for null input", () => {
    expect(transform(null)).toEqual([]);
  });

  it("handles postgresql { records } wrapper format", () => {
    const data = { records: [{ name: "X", value: 5 }] };
    const result = transform(data) as Array<{ name: string }>;
    expect(result[0].name).toBe("X");
  });

  it("uses first column as name and second as value when no name/value columns present", () => {
    const data = [{ category: "Alpha", count: 42 }];
    const result = transform(data) as Array<{ name: string; value: number }>;
    expect(result[0].name).toBe("Alpha");
    expect(result[0].value).toBe(42);
  });

  it("coerces non-numeric values to 0", () => {
    const data = [{ name: "A", value: "bad" }];
    const result = transform(data) as Array<{ value: number }>;
    expect(result[0].value).toBe(0);
  });

  it("transformWithMapping returns same result as transform", () => {
    const data = [{ name: "A", value: 10 }];
    const result = chartRegistry.treemap.transformWithMapping(data, {});
    expect(result).toEqual(transform(data));
  });
});

