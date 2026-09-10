import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  benchmarkProps,
  type BenchmarkChart,
  type BenchmarkPropsMap,
  type BenchmarkRows,
} from "@/charts/__tests__/fixtures/benchmark-data";
import { BarChart } from "@/charts/bar-chart";
import { LineChart } from "@/charts/line-chart";
import { PieChart } from "@/charts/pie-chart";
import { GaugeChart } from "@/charts/gauge-chart";
import { RadarChart } from "@/charts/radar-chart";
import { GanttChart } from "@/charts/gantt-chart";
import { SankeyChart } from "@/charts/sankey-chart";
import { SunburstChart } from "@/charts/sunburst-chart";
import { TreemapChart } from "@/charts/treemap-chart";
import { CirclePackingChart } from "@/charts/circle-packing-chart";
import { ChoroplethChart } from "@/charts/choropleth-chart";
import { MapChart } from "@/charts/map-chart";
import { GraphChart } from "@/charts/graph-chart";
import { SingleValueChart } from "@/charts/single-value-chart";

/**
 * Benchmark stories (#1688): every chart at 1k and 10k seeded rows, driven by
 * `e2e/chart-benchmark.spec.ts`. Tagged out of the vitest browser project —
 * they exist to be timed, not axe-checked, and a 10k-node NVL layout is the
 * first thing to time out on a saturated machine (#1469).
 */
const meta = {
  title: "Charts/Benchmark",
  parameters: { layout: "padded" },
  tags: ["benchmark", "!test", "!autodocs"],
  decorators: [
    (Story) => {
      // Read back by the spec as the start of time-to-first-paint: this runs
      // as React begins rendering the story, before the chart's own render
      // (where the 10k-row option object is built), its commit and effects.
      performance.mark("neoboard:bench:render");
      return (
        <div style={{ width: "100%", height: 500 }}>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const RENDER: {
  [C in BenchmarkChart]: (props: BenchmarkPropsMap[C]) => ReactElement;
} = {
  bar: (p) => <BarChart {...p} />,
  line: (p) => <LineChart {...p} />,
  pie: (p) => <PieChart {...p} />,
  gauge: (p) => <GaugeChart {...p} />,
  radar: (p) => <RadarChart {...p} />,
  gantt: (p) => <GanttChart {...p} />,
  sankey: (p) => <SankeyChart {...p} />,
  sunburst: (p) => <SunburstChart {...p} />,
  treemap: (p) => <TreemapChart {...p} />,
  "circle-packing": (p) => <CirclePackingChart {...p} />,
  choropleth: (p) => <ChoroplethChart {...p} />,
  map: (p) => <MapChart {...p} />,
  graph: (p) => <GraphChart {...p} />,
  "single-value": (p) => <SingleValueChart {...p} />,
};

/** Data is generated at module load so the timed window is the chart alone. */
function bench<C extends BenchmarkChart>(chart: C, rows: BenchmarkRows): Story {
  const props = benchmarkProps(chart, rows);
  // The mapped type is exact per key; TS cannot correlate the indexed call.
  const render = RENDER[chart] as (p: BenchmarkPropsMap[C]) => ReactElement;
  return { render: () => render(props) };
}

// `name` is a literal on every story: the spec finds them by name in the
// Storybook index, which is built by static analysis and cannot see through
// the helper.
export const Bar1k: Story = { name: "bar 1k", ...bench("bar", 1000) };
export const Bar10k: Story = { name: "bar 10k", ...bench("bar", 10000) };
export const Line1k: Story = { name: "line 1k", ...bench("line", 1000) };
export const Line10k: Story = { name: "line 10k", ...bench("line", 10000) };
export const Pie1k: Story = { name: "pie 1k", ...bench("pie", 1000) };
export const Pie10k: Story = { name: "pie 10k", ...bench("pie", 10000) };
export const Gauge1k: Story = { name: "gauge 1k", ...bench("gauge", 1000) };
export const Gauge10k: Story = { name: "gauge 10k", ...bench("gauge", 10000) };
export const Radar1k: Story = { name: "radar 1k", ...bench("radar", 1000) };
export const Radar10k: Story = { name: "radar 10k", ...bench("radar", 10000) };
export const Gantt1k: Story = { name: "gantt 1k", ...bench("gantt", 1000) };
export const Gantt10k: Story = { name: "gantt 10k", ...bench("gantt", 10000) };
export const Sankey1k: Story = { name: "sankey 1k", ...bench("sankey", 1000) };
export const Sankey10k: Story = {
  name: "sankey 10k",
  ...bench("sankey", 10000),
};
export const Sunburst1k: Story = {
  name: "sunburst 1k",
  ...bench("sunburst", 1000),
};
export const Sunburst10k: Story = {
  name: "sunburst 10k",
  ...bench("sunburst", 10000),
};
export const Treemap1k: Story = {
  name: "treemap 1k",
  ...bench("treemap", 1000),
};
export const Treemap10k: Story = {
  name: "treemap 10k",
  ...bench("treemap", 10000),
};
export const CirclePacking1k: Story = {
  name: "circle-packing 1k",
  ...bench("circle-packing", 1000),
};
export const CirclePacking10k: Story = {
  name: "circle-packing 10k",
  ...bench("circle-packing", 10000),
};
export const Choropleth1k: Story = {
  name: "choropleth 1k",
  ...bench("choropleth", 1000),
};
export const Choropleth10k: Story = {
  name: "choropleth 10k",
  ...bench("choropleth", 10000),
};
export const Map1k: Story = { name: "map 1k", ...bench("map", 1000) };
export const Map10k: Story = { name: "map 10k", ...bench("map", 10000) };
export const Graph1k: Story = { name: "graph 1k", ...bench("graph", 1000) };
export const Graph10k: Story = { name: "graph 10k", ...bench("graph", 10000) };
export const SingleValue1k: Story = {
  name: "single-value 1k",
  ...bench("single-value", 1000),
};
export const SingleValue10k: Story = {
  name: "single-value 10k",
  ...bench("single-value", 10000),
};
