import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

// One place that verifies every chart gives BaseChart a descriptive aria-label
// (was the generic "Chart visualization" fallback) and honours a caller
// override. echarts/core + container size are stubbed so the charts mount.
vi.mock("echarts/core", () => {
  const init = vi.fn(() => ({
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
  }));
  const stub = {
    use: vi.fn(),
    init,
    registerTheme: vi.fn(),
    registerMap: vi.fn(),
    getMap: vi.fn(() => ({})),
    format: { encodeHTML: (s: string) => s },
  };
  return { ...stub, default: stub };
});
vi.mock("@/hooks/useContainerSize", () => ({
  useContainerSize: () => ({ width: 600, height: 400, containerRef: vi.fn() }),
}));

import { PieChart } from "../pie-chart";
import { RadarChart } from "../radar-chart";
import { GaugeChart } from "../gauge-chart";
import { SankeyChart } from "../sankey-chart";
import { TreemapChart } from "../treemap-chart";
import { SunburstChart } from "../sunburst-chart";
import { CirclePackingChart } from "../circle-packing-chart";
import { GanttChart } from "../gantt-chart";
import { ChoroplethChart } from "../choropleth-chart";

const cases: Array<[string, React.ReactElement, RegExp]> = [
  [
    "pie",
    <PieChart data={[{ name: "A", value: 1 }]} />,
    /Pie chart with 1 segments/,
  ],
  [
    "radar",
    <RadarChart
      data={{
        indicators: [{ name: "X", max: 10 }],
        series: [{ name: "S", values: [5] }],
      }}
    />,
    /Radar chart comparing 1 series across 1 axes/,
  ],
  [
    "gauge",
    <GaugeChart data={[{ value: 50 }]} />,
    /Gauge showing 50 of 0 to 100/,
  ],
  [
    "sankey",
    <SankeyChart
      data={{
        nodes: [{ name: "A" }, { name: "B" }],
        links: [{ source: "A", target: "B", value: 1 }],
      }}
    />,
    /Sankey diagram with 2 nodes and 1 links/,
  ],
  [
    "treemap",
    <TreemapChart data={[{ name: "A", value: 1 }]} />,
    /Treemap with 1 top-level items/,
  ],
  [
    "sunburst",
    <SunburstChart data={[{ name: "A", value: 1 }]} />,
    /Sunburst chart with 1 top-level segments/,
  ],
  [
    "circle-packing",
    <CirclePackingChart data={[{ name: "A", value: 1 }]} />,
    /Circle-packing chart with 1 top-level groups/,
  ],
  [
    "gantt",
    <GanttChart data={[{ task: "T", start: 0, end: 1 }]} />,
    /Gantt chart with 1 tasks/,
  ],
  [
    "choropleth",
    <ChoroplethChart data={[{ name: "United States", value: 1 }]} />,
    /Choropleth map with 1 regions/,
  ],
];

afterEach(cleanup);

describe("chart aria descriptions", () => {
  it.each(cases)("%s gets a descriptive aria-label", (_name, el, re) => {
    render(el);
    expect(screen.getByTestId("base-chart").getAttribute("aria-label")).toMatch(
      re,
    );
  });

  it("honours a caller-provided ariaDescription override", () => {
    render(
      <PieChart data={[{ name: "A", value: 1 }]} ariaDescription="Custom" />,
    );
    expect(screen.getByTestId("base-chart")).toHaveAttribute(
      "aria-label",
      "Custom",
    );
  });
});
