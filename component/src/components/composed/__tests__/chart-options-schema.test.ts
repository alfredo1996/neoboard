import { describe, it, expect } from "vitest";
import { getChartOptions, getDefaultChartSettings } from "../chart-options-schema";

describe("getChartOptions", () => {
  it("returns options for bar chart", () => {
    const options = getChartOptions("bar");
    const keys = options.map((o) => o.key);
    expect(keys).toContain("orientation");
    expect(keys).toContain("stacked");
    expect(keys).toContain("showValues");
    expect(keys).toContain("showLegend");
  });

  it("returns options for line chart", () => {
    const keys = getChartOptions("line").map((o) => o.key);
    expect(keys).toContain("smooth");
    expect(keys).toContain("area");
    expect(keys).toContain("xAxisLabel");
    expect(keys).toContain("yAxisLabel");
    expect(keys).toContain("showLegend");
  });

  it("returns options for pie chart", () => {
    const keys = getChartOptions("pie").map((o) => o.key);
    expect(keys).toContain("donut");
    expect(keys).toContain("showLabel");
    expect(keys).toContain("showLegend");
  });

  it("returns options for single-value chart", () => {
    const keys = getChartOptions("single-value").map((o) => o.key);
    expect(keys).toContain("title");
    expect(keys).toContain("prefix");
    expect(keys).toContain("suffix");
  });

  it("returns options for graph chart", () => {
    const keys = getChartOptions("graph").map((o) => o.key);
    expect(keys).toContain("layout");
    expect(keys).toContain("showLabels");
  });

  it("returns options for map chart", () => {
    const keys = getChartOptions("map").map((o) => o.key);
    expect(keys).toContain("tileLayer");
    expect(keys).toContain("zoom");
    expect(keys).toContain("minZoom");
    expect(keys).toContain("maxZoom");
    expect(keys).toContain("autoFitBounds");
  });

  it("returns options for table chart", () => {
    const keys = getChartOptions("table").map((o) => o.key);
    expect(keys).toContain("enableSorting");
    expect(keys).toContain("enableSelection");
    expect(keys).toContain("enableGlobalFilter");
    expect(keys).toContain("enableColumnFilters");
    expect(keys).toContain("pageSize");
  });

  it("returns options for json chart", () => {
    const keys = getChartOptions("json").map((o) => o.key);
    expect(keys).toContain("initialExpanded");
  });

  it("returns empty array for unknown chart type", () => {
    expect(getChartOptions("unknown")).toEqual([]);
  });

  it("every option has required fields", () => {
    const types = ["bar", "line", "pie", "single-value", "graph", "map", "table", "json"];
    for (const type of types) {
      for (const opt of getChartOptions(type)) {
        expect(opt).toHaveProperty("key");
        expect(opt).toHaveProperty("label");
        expect(opt).toHaveProperty("type");
        expect(opt).toHaveProperty("default");
        expect(opt).toHaveProperty("category");
        expect(["boolean", "select", "text", "number"]).toContain(opt.type);
      }
    }
  });

  it("select-type options have non-empty options array", () => {
    const types = ["bar", "line", "pie", "single-value", "graph", "map", "table", "json"];
    for (const type of types) {
      for (const opt of getChartOptions(type)) {
        if (opt.type === "select") {
          expect(opt.options).toBeDefined();
          expect(opt.options!.length).toBeGreaterThan(0);
          for (const item of opt.options!) {
            expect(item).toHaveProperty("label");
            expect(item).toHaveProperty("value");
          }
        }
      }
    }
  });
});

describe("getDefaultChartSettings", () => {
  it("returns correct defaults for bar chart", () => {
    const d = getDefaultChartSettings("bar");
    expect(d.orientation).toBe("vertical");
    expect(d.stacked).toBe(false);
    expect(d.showValues).toBe(false);
    expect(d.showLegend).toBe(true);
  });

  it("returns correct defaults for line chart", () => {
    const d = getDefaultChartSettings("line");
    expect(d.smooth).toBe(false);
    expect(d.area).toBe(false);
    expect(d.showLegend).toBe(true);
  });

  it("returns correct defaults for table chart", () => {
    const d = getDefaultChartSettings("table");
    expect(d.enableSorting).toBe(true);
    expect(d.enableGlobalFilter).toBe(true);
    expect(d.enableColumnFilters).toBe(true);
    expect(d.pageSize).toBe(20);
  });

  it("returns empty object for unknown type", () => {
    expect(getDefaultChartSettings("unknown")).toEqual({});
  });

  it("includes a key for every defined option", () => {
    const types = ["bar", "line", "pie", "single-value", "graph", "map", "table", "json"];
    for (const type of types) {
      const options = getChartOptions(type);
      const defaults = getDefaultChartSettings(type);
      for (const opt of options) {
        expect(defaults).toHaveProperty(opt.key);
      }
    }
  });
});
