import { describe, it, expect, vi } from "vitest";

// Mock @neoboard/components to avoid importing React component trees
vi.mock("@neoboard/components", () => ({
  MarkdownWidget: () => null,
  BarChart: () => null,
  LineChart: () => null,
  PieChart: () => null,
  SingleValueChart: () => null,
  GraphChart: () => null,
  MapChart: () => null,
  JsonViewer: () => null,
  IframeWidget: () => null,
  GaugeChart: () => null,
  SankeyChart: () => null,
  SunburstChart: () => null,
  RadarChart: () => null,
  TreemapChart: () => null,
  EmptyState: () => null,
  Skeleton: () => null,
  getChartOptions: () => [],
}));

import { CHART_TYPES, type ChartType } from "../chart-types";
import { pluginRegistry } from "../index";

describe("CHART_TYPES constant", () => {
  it("is a non-empty readonly array", () => {
    expect(Array.isArray(CHART_TYPES)).toBe(true);
    expect(CHART_TYPES.length).toBeGreaterThan(0);
  });

  it("contains only unique values", () => {
    const unique = new Set(CHART_TYPES);
    expect(unique.size).toBe(CHART_TYPES.length);
  });

  it("matches registered plugin types after bootstrap", () => {
    const registeredTypes = new Set(pluginRegistry.getTypes());
    for (const t of CHART_TYPES) {
      expect(
        registeredTypes.has(t),
        `"${t}" is in CHART_TYPES but not registered`,
      ).toBe(true);
    }
  });

  it("every registered plugin type is in CHART_TYPES", () => {
    const chartTypeSet = new Set<string>(CHART_TYPES);
    for (const t of pluginRegistry.getTypes()) {
      expect(
        chartTypeSet.has(t),
        `"${t}" is registered but not in CHART_TYPES`,
      ).toBe(true);
    }
  });

  it("ChartType union accepts all CHART_TYPES entries", () => {
    // TypeScript compile-time check — if this compiles, the types match.
    const types: ChartType[] = [...CHART_TYPES];
    expect(types.length).toBe(CHART_TYPES.length);
  });
});
