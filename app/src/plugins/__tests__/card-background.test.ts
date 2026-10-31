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
  EmptyState: () => null,
  Skeleton: () => null,
  getChartOptions: () => [],
}));

import { pluginRegistry } from "../index";
import { chartSupportsCardBackground } from "@/lib/plugin/chart-helpers";

// The real plugins, not the stubs: a stub would answer for a plugin that
// forgot the flag (#2394).
const TINTABLE = [
  "form",
  "json",
  "markdown",
  "parameter-select",
  "single-value",
  "table",
];

describe("supportsCardBackground (#2394)", () => {
  it("is true on exactly the six non-chart plugins", () => {
    const on = pluginRegistry
      .getAll()
      .filter((p) => p.capabilities.supportsCardBackground)
      .map((p) => p.type)
      .sort((a, b) => a.localeCompare(b));
    expect(on).toEqual(TINTABLE);
  });

  it("the helper answers per type, and false for an unknown one", () => {
    expect(chartSupportsCardBackground("table")).toBe(true);
    expect(chartSupportsCardBackground("bar")).toBe(false);
    expect(chartSupportsCardBackground("iframe")).toBe(false);
    expect(chartSupportsCardBackground("nope")).toBe(false);
  });
});
