/**
 * Tests for table, single-value, map, json, gauge, sankey, hierarchical,
 * radar, and parameter-select transforms.
 */
import { describe, it, expect } from "vitest";
import { transformToTableData } from "../table";
import { transformToValueData, validateValueData } from "../single-value";
import { transformToMapData, validateMapData } from "../map";
import { transformToJsonData } from "../json";
import { transformToGaugeData } from "../gauge";
import { transformToSankeyData } from "../sankey";
import { transformToHierarchicalData } from "../hierarchical";
import { transformToRadarData } from "../radar";
import { transformToSelectData } from "../parameter-select";

// ── table ──────────────────────────────────────────────────────────────────

describe("transformToTableData", () => {
  it("returns array format unchanged", () => {
    const data = [{ a: 1, b: 2 }];
    expect(transformToTableData(data)).toEqual(data);
  });

  it("unwraps { records } wrapper", () => {
    const records = [{ a: 1 }];
    expect(transformToTableData({ records })).toEqual(records);
  });

  it("returns empty array for null", () => {
    expect(transformToTableData(null)).toEqual([]);
  });
});

// ── single-value ───────────────────────────────────────────────────────────

describe("transformToValueData", () => {
  it("extracts the first value from the first record", () => {
    expect(transformToValueData([{ count: 42 }])).toBe(42);
  });

  it("passes through raw number", () => {
    expect(transformToValueData(7)).toBe(7);
  });

  it("returns 0 for null/undefined", () => {
    expect(transformToValueData(null)).toBe(0);
    expect(transformToValueData(undefined)).toBe(0);
  });

  it("returns 0 for empty array", () => {
    expect(transformToValueData([])).toBe(0);
  });
});

describe("validateValueData", () => {
  it("returns null for empty data", () => {
    expect(validateValueData([])).toBeNull();
  });

  it("returns null for data with values", () => {
    expect(validateValueData([{ count: 42 }])).toBeNull();
  });

  it("returns error for record with no values", () => {
    const err = validateValueData([{}]);
    expect(err).toBeTruthy();
    expect(err).toContain("Single value");
  });
});

// ── map ────────────────────────────────────────────────────────────────────

describe("transformToMapData", () => {
  it("extracts lat/lng from records", () => {
    const data = [{ name: "HQ", lat: 51.5, lng: -0.1 }];
    const result = transformToMapData(data) as Array<{
      lat: number;
      lng: number;
      label?: string;
    }>;
    expect(result).toHaveLength(1);
    expect(result[0].lat).toBeCloseTo(51.5);
    expect(result[0].label).toBe("HQ");
  });

  it("returns empty array for empty input", () => {
    expect(transformToMapData([])).toEqual([]);
  });
});

describe("validateMapData", () => {
  it("returns null for empty data", () => {
    expect(validateMapData([])).toBeNull();
  });

  it("returns error when no lat/lng columns found", () => {
    const err = validateMapData([{ name: "City", value: 42 }]);
    expect(err).toBeTruthy();
    expect(err).toContain("Map chart");
  });
});

// ── json ───────────────────────────────────────────────────────────────────

describe("transformToJsonData", () => {
  it("returns records array for array input", () => {
    const data = [{ key: "value" }];
    expect(transformToJsonData(data)).toEqual(data);
  });

  it("returns original data when no records extracted", () => {
    const data = { arbitrary: true };
    expect(transformToJsonData(data)).toEqual(data);
  });
});

// ── gauge ──────────────────────────────────────────────────────────────────

describe("transformToGaugeData", () => {
  it("returns single { value, name }", () => {
    const data = [{ value: 75, name: "Score" }];
    const result = transformToGaugeData(data) as Array<{
      value: number;
      name: string;
    }>;
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(75);
    expect(result[0].name).toBe("Score");
  });

  it("returns empty array for empty input", () => {
    expect(transformToGaugeData([])).toEqual([]);
  });

  it("coerces non-numeric values to 0", () => {
    const data = [{ value: "bad", name: "Test" }];
    const result = transformToGaugeData(data) as Array<{ value: number }>;
    expect(result[0].value).toBe(0);
  });
});

// ── sankey ──────────────────────────────────────────────────────────────────

describe("transformToSankeyData", () => {
  it("produces { nodes, links }", () => {
    const data = [{ source: "A", target: "B", value: 10 }];
    const result = transformToSankeyData(data) as {
      nodes: Array<{ name: string }>;
      links: Array<{ source: string; target: string; value: number }>;
    };
    expect(result.links).toHaveLength(1);
    expect(result.links[0].source).toBe("A");
    expect(result.nodes.length).toBeGreaterThan(0);
  });

  it("returns empty for empty input", () => {
    const result = transformToSankeyData([]) as {
      nodes: unknown[];
      links: unknown[];
    };
    expect(result.nodes).toEqual([]);
    expect(result.links).toEqual([]);
  });
});

// ── hierarchical (sunburst/treemap) ────────────────────────────────────────

describe("transformToHierarchicalData", () => {
  it("passes through pre-hierarchical data", () => {
    const data = [
      { name: "Root", value: 100, children: [{ name: "Child", value: 50 }] },
    ];
    const result = transformToHierarchicalData(data) as Array<{
      children?: unknown[];
    }>;
    expect(result[0].children).toHaveLength(1);
  });

  it("builds hierarchy from flat records with parent column", () => {
    const data = [
      { name: "root", parent: "", value: 0 },
      { name: "A", parent: "root", value: 10 },
    ];
    const result = transformToHierarchicalData(data) as Array<{
      name: string;
      children?: Array<{ name: string }>;
    }>;
    const rootNode = result.find((r) => r.name === "root");
    expect(rootNode?.children).toBeDefined();
  });

  it("returns flat array when no parent column or children key", () => {
    const data = [{ name: "A", value: 10 }];
    const result = transformToHierarchicalData(data) as Array<{
      name: string;
      value: number;
    }>;
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("A");
  });

  it("returns empty array for empty input", () => {
    expect(transformToHierarchicalData([])).toEqual([]);
  });
});

// ── radar ──────────────────────────────────────────────────────────────────

describe("transformToRadarData", () => {
  it("produces { indicators, series } from long-format records", () => {
    const data = [
      { indicator: "Speed", value: 80, max: 100 },
      { indicator: "Strength", value: 60, max: 100 },
    ];
    const result = transformToRadarData(data) as {
      indicators: Array<{ name: string; max: number }>;
      series: Array<{ values: number[] }>;
    };
    expect(result.indicators).toHaveLength(2);
    expect(result.series[0].values).toHaveLength(2);
  });

  it("returns empty for empty input", () => {
    const result = transformToRadarData([]) as {
      indicators: unknown[];
      series: unknown[];
    };
    expect(result.indicators).toEqual([]);
    expect(result.series).toEqual([]);
  });

  it("uses global max when max column is missing", () => {
    const data = [{ indicator: "Speed", value: 80 }];
    const result = transformToRadarData(data) as {
      indicators: Array<{ max: number }>;
    };
    expect(result.indicators[0].max).toBe(Math.ceil(80 * 1.1));
  });

  it("handles wide-format tabular data", () => {
    const data = [{ Speed: 80, Strength: 60 }];
    const result = transformToRadarData(data) as {
      indicators: Array<{ name: string }>;
      series: Array<{ values: number[] }>;
    };
    expect(result.indicators.map((i) => i.name)).toContain("Speed");
    expect(result.series[0].values).toHaveLength(2);
  });
});

// ── parameter-select ───────────────────────────────────────────────────────

describe("transformToSelectData", () => {
  it("extracts first column values", () => {
    const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(transformToSelectData(data)).toEqual([1, 2, 3]);
  });

  it("filters out null and undefined values", () => {
    const data = [{ id: 1 }, { id: null }, { id: undefined }, { id: 4 }];
    expect(transformToSelectData(data)).toEqual([1, 4]);
  });

  it("returns empty array for empty input", () => {
    expect(transformToSelectData([])).toEqual([]);
  });

  it("returns empty array for record with no keys", () => {
    expect(transformToSelectData([{}])).toEqual([]);
  });
});
