import { describe, it, expect } from "vitest";
import {
  getCompatibleChartTypes,
  chartRegistry,
} from "../chart-registry";
import type { ChartType } from "../chart-registry";

describe("getCompatibleChartTypes", () => {
  it("returns all chart types for neo4j", () => {
    const result = getCompatibleChartTypes("neo4j");
    // All nine types must be present for neo4j
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

  it("postgresql result has 8 types (all except graph)", () => {
    const result = getCompatibleChartTypes("postgresql");
    expect(result).toHaveLength(8);
  });

  it("neo4j result has all 9 types", () => {
    const result = getCompatibleChartTypes("neo4j");
    expect(result).toHaveLength(9);
  });

  it("returned types are valid ChartType values", () => {
    const allTypes = new Set(Object.keys(chartRegistry));
    const neo4jTypes = getCompatibleChartTypes("neo4j");
    for (const type of neo4jTypes) {
      expect(allTypes.has(type)).toBe(true);
    }
  });
});

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
});
