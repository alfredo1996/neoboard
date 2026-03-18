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
    expect(keys).toContain("emptyMessage");
  });

  it("returns options for json chart", () => {
    const keys = getChartOptions("json").map((o) => o.key);
    expect(keys).toContain("initialExpanded");
  });

  it("returns only secondary options for parameter-select", () => {
    const options = getChartOptions("parameter-select");
    const keys = options.map((o) => o.key);
    expect(keys).toEqual(["placeholder", "searchable"]);
    expect(options).toHaveLength(2);
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
    expect(d.pageSize).toBe(10);
    expect(d.emptyMessage).toBe("No results");
  });

  it("returns empty object for unknown type", () => {
    expect(getDefaultChartSettings("unknown")).toEqual({});
  });

  it("defaults searchable to true for parameter-select", () => {
    const d = getDefaultChartSettings("parameter-select");
    expect(d.searchable).toBe(true);
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

  // ── Behavior options (showRefreshButton, manualRun) ──────────────────────

  it("includes showRefreshButton and manualRun for all chart types except parameter-select and form", () => {
    const typesWithBehavior = ["bar", "line", "pie", "single-value", "graph", "map", "table", "json"];
    for (const type of typesWithBehavior) {
      const keys = getChartOptions(type).map((o) => o.key);
      expect(keys).toContain("showRefreshButton");
      expect(keys).toContain("manualRun");
    }
  });

  it("does NOT include showRefreshButton or manualRun for parameter-select", () => {
    const keys = getChartOptions("parameter-select").map((o) => o.key);
    expect(keys).not.toContain("showRefreshButton");
    expect(keys).not.toContain("manualRun");
  });

  it("does NOT include showRefreshButton or manualRun for form", () => {
    const keys = getChartOptions("form").map((o) => o.key);
    expect(keys).not.toContain("showRefreshButton");
    expect(keys).not.toContain("manualRun");
  });

  it("behavior options have category 'Behavior'", () => {
    const options = getChartOptions("bar");
    const refresh = options.find((o) => o.key === "showRefreshButton");
    const manual = options.find((o) => o.key === "manualRun");
    expect(refresh?.category).toBe("Behavior");
    expect(manual?.category).toBe("Behavior");
  });

  it("behavior options default to false", () => {
    const defaults = getDefaultChartSettings("bar");
    expect(defaults.showRefreshButton).toBe(false);
    expect(defaults.manualRun).toBe(false);
  });

  // ── cacheMode ─────────────────────────────────────────────────────────────

  it("includes cacheMode for all chart types except parameter-select and form", () => {
    const types = ["bar", "line", "pie", "single-value", "graph", "map", "table", "json"];
    for (const type of types) {
      const keys = getChartOptions(type).map((o) => o.key);
      expect(keys).toContain("cacheMode");
    }
  });

  it("does NOT include cacheMode for parameter-select", () => {
    const keys = getChartOptions("parameter-select").map((o) => o.key);
    expect(keys).not.toContain("cacheMode");
  });

  it("does NOT include cacheMode for form", () => {
    const keys = getChartOptions("form").map((o) => o.key);
    expect(keys).not.toContain("cacheMode");
  });

  it("defaults cacheMode to 'ttl'", () => {
    const defaults = getDefaultChartSettings("bar");
    expect(defaults.cacheMode).toBe("ttl");
  });

  it("cacheMode is a select option in category 'Behavior' with ttl and forever values", () => {
    const options = getChartOptions("bar");
    const cacheMode = options.find((o) => o.key === "cacheMode");
    expect(cacheMode?.type).toBe("select");
    expect(cacheMode?.category).toBe("Behavior");
    expect(cacheMode?.options).toHaveLength(2);
    expect(cacheMode?.options).toContainEqual({ label: "TTL (time-based)", value: "ttl" });
    expect(cacheMode?.options).toContainEqual({ label: "Forever (until refresh)", value: "forever" });
  });

  // ── Accessibility options (colorblindMode) ─────────────────────────────

  it("includes colorblindMode for bar, line, and pie charts", () => {
    for (const type of ["bar", "line", "pie"]) {
      const keys = getChartOptions(type).map((o) => o.key);
      expect(keys).toContain("colorblindMode");
    }
  });

  it("does NOT include colorblindMode for non-ECharts chart types", () => {
    for (const type of ["single-value", "graph", "map", "table", "json", "parameter-select", "form"]) {
      const keys = getChartOptions(type).map((o) => o.key);
      expect(keys).not.toContain("colorblindMode");
    }
  });

  it("defaults colorblindMode to false", () => {
    const defaults = getDefaultChartSettings("bar");
    expect(defaults.colorblindMode).toBe(false);
  });

  it("colorblindMode has category 'Accessibility'", () => {
    const options = getChartOptions("bar");
    const opt = options.find((o) => o.key === "colorblindMode");
    expect(opt?.category).toBe("Accessibility");
    expect(opt?.type).toBe("boolean");
  });
});

describe("markdown chart options", () => {
  it("returns content option for markdown", () => {
    const options = getChartOptions("markdown");
    expect(options.map((o) => o.key)).toContain("content");
  });

  it("content option is text type with empty default", () => {
    const options = getChartOptions("markdown");
    const content = options.find((o) => o.key === "content");
    expect(content?.type).toBe("text");
    expect(content?.default).toBe("");
    expect(content?.category).toBe("Content");
  });

  it("defaults include empty content", () => {
    const defaults = getDefaultChartSettings("markdown");
    expect(defaults).toHaveProperty("content", "");
  });
});

describe("iframe chart options", () => {
  it("returns url, iframeTitle, and sandbox options", () => {
    const options = getChartOptions("iframe");
    const keys = options.map((o) => o.key);
    expect(keys).toContain("url");
    expect(keys).toContain("iframeTitle");
    expect(keys).toContain("sandbox");
  });

  it("url option is text type in Content category", () => {
    const options = getChartOptions("iframe");
    const url = options.find((o) => o.key === "url");
    expect(url?.type).toBe("text");
    expect(url?.default).toBe("");
    expect(url?.category).toBe("Content");
  });

  it("iframeTitle defaults to 'Embedded content'", () => {
    const options = getChartOptions("iframe");
    const title = options.find((o) => o.key === "iframeTitle");
    expect(title?.default).toBe("Embedded content");
  });

  it("sandbox option is in Security category", () => {
    const options = getChartOptions("iframe");
    const sandbox = options.find((o) => o.key === "sandbox");
    expect(sandbox?.category).toBe("Security");
  });

  it("defaults include all iframe settings", () => {
    const defaults = getDefaultChartSettings("iframe");
    expect(defaults).toHaveProperty("url", "");
    expect(defaults).toHaveProperty("iframeTitle", "Embedded content");
    expect(defaults).toHaveProperty("sandbox");
  });
});

// ---------------------------------------------------------------------------
// gauge chart options
// ---------------------------------------------------------------------------
describe("gauge chart options", () => {
  it("returns options for gauge chart", () => {
    const keys = getChartOptions("gauge").map((o) => o.key);
    expect(keys).toContain("min");
    expect(keys).toContain("max");
    expect(keys).toContain("showProgress");
  });

  it("defaults min to 0 and max to 100", () => {
    const defaults = getDefaultChartSettings("gauge");
    expect(defaults.min).toBe(0);
    expect(defaults.max).toBe(100);
  });

  it("includes behavior options (showRefreshButton, manualRun, cacheMode)", () => {
    const keys = getChartOptions("gauge").map((o) => o.key);
    expect(keys).toContain("showRefreshButton");
    expect(keys).toContain("manualRun");
    expect(keys).toContain("cacheMode");
  });

  it("every option has required fields", () => {
    for (const opt of getChartOptions("gauge")) {
      expect(opt).toHaveProperty("key");
      expect(opt).toHaveProperty("label");
      expect(opt).toHaveProperty("type");
      expect(opt).toHaveProperty("default");
      expect(opt).toHaveProperty("category");
    }
  });
});

// ---------------------------------------------------------------------------
// sankey chart options
// ---------------------------------------------------------------------------
describe("sankey chart options", () => {
  it("returns options for sankey chart", () => {
    const keys = getChartOptions("sankey").map((o) => o.key);
    expect(keys).toContain("orient");
    expect(keys).toContain("showLabels");
  });

  it("orient option has horizontal and vertical values", () => {
    const opts = getChartOptions("sankey");
    const orient = opts.find((o) => o.key === "orient");
    expect(orient?.type).toBe("select");
    expect(orient?.options).toContainEqual({ label: "Horizontal", value: "horizontal" });
    expect(orient?.options).toContainEqual({ label: "Vertical", value: "vertical" });
  });

  it("includes behavior options", () => {
    const keys = getChartOptions("sankey").map((o) => o.key);
    expect(keys).toContain("showRefreshButton");
    expect(keys).toContain("cacheMode");
  });

  it("every option has required fields", () => {
    for (const opt of getChartOptions("sankey")) {
      expect(opt).toHaveProperty("key");
      expect(opt).toHaveProperty("label");
      expect(opt).toHaveProperty("type");
      expect(opt).toHaveProperty("default");
      expect(opt).toHaveProperty("category");
    }
  });
});

// ---------------------------------------------------------------------------
// sunburst chart options
// ---------------------------------------------------------------------------
describe("sunburst chart options", () => {
  it("returns options for sunburst chart", () => {
    const keys = getChartOptions("sunburst").map((o) => o.key);
    expect(keys).toContain("showLabels");
    expect(keys).toContain("sort");
  });

  it("includes behavior options", () => {
    const keys = getChartOptions("sunburst").map((o) => o.key);
    expect(keys).toContain("showRefreshButton");
    expect(keys).toContain("cacheMode");
  });

  it("every option has required fields", () => {
    for (const opt of getChartOptions("sunburst")) {
      expect(opt).toHaveProperty("key");
      expect(opt).toHaveProperty("label");
      expect(opt).toHaveProperty("type");
      expect(opt).toHaveProperty("default");
      expect(opt).toHaveProperty("category");
    }
  });
});

// ---------------------------------------------------------------------------
// radar chart options
// ---------------------------------------------------------------------------
describe("radar chart options", () => {
  it("returns options for radar chart", () => {
    const keys = getChartOptions("radar").map((o) => o.key);
    expect(keys).toContain("shape");
    expect(keys).toContain("showLegend");
    expect(keys).toContain("filled");
  });

  it("shape option has polygon and circle values", () => {
    const opts = getChartOptions("radar");
    const shape = opts.find((o) => o.key === "shape");
    expect(shape?.type).toBe("select");
    expect(shape?.options).toContainEqual({ label: "Polygon", value: "polygon" });
    expect(shape?.options).toContainEqual({ label: "Circle", value: "circle" });
  });

  it("includes behavior options", () => {
    const keys = getChartOptions("radar").map((o) => o.key);
    expect(keys).toContain("showRefreshButton");
    expect(keys).toContain("cacheMode");
  });

  it("every option has required fields", () => {
    for (const opt of getChartOptions("radar")) {
      expect(opt).toHaveProperty("key");
      expect(opt).toHaveProperty("label");
      expect(opt).toHaveProperty("type");
      expect(opt).toHaveProperty("default");
      expect(opt).toHaveProperty("category");
    }
  });
});

// ---------------------------------------------------------------------------
// treemap chart options
// ---------------------------------------------------------------------------
describe("treemap chart options", () => {
  it("returns options for treemap chart", () => {
    const keys = getChartOptions("treemap").map((o) => o.key);
    expect(keys).toContain("showLabels");
    expect(keys).toContain("showBreadcrumb");
  });

  it("includes behavior options", () => {
    const keys = getChartOptions("treemap").map((o) => o.key);
    expect(keys).toContain("showRefreshButton");
    expect(keys).toContain("cacheMode");
  });

  it("every option has required fields", () => {
    for (const opt of getChartOptions("treemap")) {
      expect(opt).toHaveProperty("key");
      expect(opt).toHaveProperty("label");
      expect(opt).toHaveProperty("type");
      expect(opt).toHaveProperty("default");
      expect(opt).toHaveProperty("category");
    }
  });
});
