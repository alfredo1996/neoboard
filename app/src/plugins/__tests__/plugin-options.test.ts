import { describe, it, expect, vi } from "vitest";

// vi.mock factories are hoisted — all values must come from vi.hoisted().
const { Stub, OPTION_COUNTS, fakeGetChartOptions } = vi.hoisted(() => {
  const StubFn = () => null;
  const counts: Record<string, number> = {
    bar: 15,
    line: 18,
    pie: 12,
    "single-value": 8,
    graph: 4,
    map: 6,
    table: 4,
    json: 2,
    "parameter-select": 9,
    form: 2,
    markdown: 1,
    iframe: 3,
    gauge: 8,
    sankey: 7,
    sunburst: 6,
    radar: 7,
    treemap: 7,
  };
  function makeFakeOption(key: string) {
    return {
      key,
      label: key,
      type: "boolean" as const,
      default: false,
      category: "Test",
    };
  }
  function getOpts(type: string) {
    const count = counts[type];
    if (!count) return [];
    return Array.from({ length: count }, (_, i) =>
      makeFakeOption(`${type}-opt-${i}`),
    );
  }
  return { Stub: StubFn, OPTION_COUNTS: counts, fakeGetChartOptions: getOpts };
});

vi.mock("@neoboard/components", () => ({
  getChartOptions: fakeGetChartOptions,
  BarChart: Stub,
  LineChart: Stub,
  PieChart: Stub,
  SingleValueChart: Stub,
  GraphChart: Stub,
  MapChart: Stub,
  JsonViewer: Stub,
  MarkdownWidget: Stub,
  IframeWidget: Stub,
  GaugeChart: Stub,
  SankeyChart: Stub,
  SunburstChart: Stub,
  RadarChart: Stub,
  TreemapChart: Stub,
  EmptyState: Stub,
  Skeleton: Stub,
}));

vi.mock("@/components/table-renderer", () => ({ TableRenderer: Stub }));
vi.mock("@/components/parameter-widget-renderer", () => ({
  ParameterWidgetRenderer: Stub,
}));
vi.mock("@/components/form-widget-renderer", () => ({
  FormWidgetRenderer: Stub,
}));
vi.mock("@/components/graph-exploration-wrapper", () => ({
  GraphExplorationWrapper: Stub,
}));

import { pluginRegistry, CHART_TYPES } from "../index";

describe("plugin options (Phase 5)", () => {
  it("bar plugin has options defined with entries", () => {
    const bar = pluginRegistry.get("bar");
    expect(bar).toBeDefined();
    expect(bar!.options).toBeDefined();
    expect(bar!.options!.length).toBeGreaterThan(0);
  });

  it("line plugin has options defined with entries", () => {
    const line = pluginRegistry.get("line");
    expect(line).toBeDefined();
    expect(line!.options).toBeDefined();
    expect(line!.options!.length).toBeGreaterThan(0);
  });

  it("pie plugin has options defined with entries", () => {
    const pie = pluginRegistry.get("pie");
    expect(pie).toBeDefined();
    expect(pie!.options).toBeDefined();
    expect(pie!.options!.length).toBeGreaterThan(0);
  });

  it("every registered chart type has options array", () => {
    for (const type of CHART_TYPES) {
      const plugin = pluginRegistry.get(type);
      expect(plugin, `plugin for ${type} should exist`).toBeDefined();
      expect(
        plugin!.options,
        `plugin ${type} should have options`,
      ).toBeDefined();
      expect(
        Array.isArray(plugin!.options),
        `plugin ${type} options should be an array`,
      ).toBe(true);
    }
  });

  it("all 20 chart types are registered", () => {
    expect(CHART_TYPES.length).toBe(20);
    for (const type of CHART_TYPES) {
      expect(pluginRegistry.has(type), `${type} should be registered`).toBe(
        true,
      );
    }
  });

  it("options come from getChartOptions — they match the mock output", () => {
    const bar = pluginRegistry.get("bar");
    expect(bar!.options!.length).toBe(OPTION_COUNTS["bar"]);
    expect(bar!.options![0].key).toBe("bar-opt-0");
  });

  it("each option has required ChartOptionDef fields", () => {
    const bar = pluginRegistry.get("bar");
    for (const opt of bar!.options!) {
      expect(opt).toHaveProperty("key");
      expect(opt).toHaveProperty("label");
      expect(opt).toHaveProperty("type");
      expect(opt).toHaveProperty("default");
      expect(opt).toHaveProperty("category");
    }
  });
});
