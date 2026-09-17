/**
 * Deterministic data for the per-chart render benchmark (#1688).
 *
 * One generator per chart story under stories/charts, each shaped like what
 * that chart's app transform hands it, at an exact row count. Everything is
 * seeded — a benchmark whose data changes between runs measures the data,
 * not the chart.
 *
 * Lives beside the connector-output fixtures (#1636) because it is test
 * tooling, not library code: consumed by `stories/charts/benchmark.stories.tsx`
 * and the Playwright spec in `e2e/`, excluded from coverage like the rest of
 * `__tests__/`.
 */
import type { BarChartProps } from "../../bar-chart";
import type { LineChartProps } from "../../line-chart";
import type { PieChartProps } from "../../pie-chart";
import type { GaugeChartProps } from "../../gauge-chart";
import type { RadarChartProps } from "../../radar-chart";
import type { GanttChartProps } from "../../gantt-chart";
import type { SankeyChartProps } from "../../sankey-chart";
import type { SunburstChartProps } from "../../sunburst-chart";
import type { TreemapChartProps } from "../../treemap-chart";
import type { CirclePackingChartProps } from "../../circle-packing-chart";
import type { ChoroplethChartProps } from "../../choropleth-chart";
import type { MapChartProps } from "../../map-chart";
import type { GraphChartProps } from "../../graph-chart";
import type { SingleValueChartProps } from "../../single-value-chart";
import world from "../../world.geo.json" with { type: "json" };

export const BENCHMARK_CHARTS = [
  "bar",
  "line",
  "pie",
  "gauge",
  "radar",
  "gantt",
  "sankey",
  "sunburst",
  "treemap",
  "circle-packing",
  "choropleth",
  "map",
  "graph",
  "single-value",
] as const;
export type BenchmarkChart = (typeof BENCHMARK_CHARTS)[number];

export const BENCHMARK_ROW_COUNTS = [1000, 10000] as const;
export type BenchmarkRows = (typeof BENCHMARK_ROW_COUNTS)[number];

export interface BenchmarkPropsMap {
  bar: BarChartProps;
  line: LineChartProps;
  pie: PieChartProps;
  gauge: GaugeChartProps;
  radar: RadarChartProps;
  gantt: GanttChartProps;
  sankey: SankeyChartProps;
  sunburst: SunburstChartProps;
  treemap: TreemapChartProps;
  "circle-packing": CirclePackingChartProps;
  choropleth: ChoroplethChartProps;
  map: MapChartProps;
  graph: GraphChartProps;
  "single-value": SingleValueChartProps;
}

/** mulberry32 — a 32-bit seeded PRNG in four lines, plenty for fixtures. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 1688;
const DAY = 86_400_000;
const GANTT_START = Date.UTC(2026, 0, 1);
const REGION_NAMES = (
  world as { features: { properties: { name: string } }[] }
).features.map((f) => f.properties.name);

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** `rows` leaves spread over ~sqrt(rows) groups — the sunburst/treemap/circle-packing shape. */
function twoLevelTree(rows: number) {
  const rnd = seededRandom(SEED);
  const perGroup = Math.ceil(Math.sqrt(rows));
  const groups: {
    name: string;
    children: { name: string; value: number }[];
  }[] = [];
  for (const i of range(rows)) {
    const g = Math.floor(i / perGroup);
    groups[g] ??= { name: `group ${g}`, children: [] };
    groups[g].children.push({
      name: `leaf ${i}`,
      value: 1 + Math.round(rnd() * 999),
    });
  }
  return groups;
}

const generators: {
  [C in BenchmarkChart]: (rows: number) => BenchmarkPropsMap[C];
} = {
  bar: (rows) => {
    const rnd = seededRandom(SEED);
    return {
      data: range(rows).map((i) => ({
        label: `c${i}`,
        value: Math.round(rnd() * 1000),
      })),
    };
  },
  line: (rows) => {
    const rnd = seededRandom(SEED);
    return {
      data: range(rows).map((i) => ({ x: i, y: Math.round(rnd() * 1000) })),
    };
  },
  pie: (rows) => {
    const rnd = seededRandom(SEED);
    return {
      data: range(rows).map((i) => ({
        name: `slice ${i}`,
        value: 1 + Math.round(rnd() * 999),
      })),
    };
  },
  // The gauge reads data[0] only; the rest of the rows are what a query
  // that forgot to aggregate would send it.
  gauge: (rows) => {
    const rnd = seededRandom(SEED);
    return {
      data: range(rows).map((i) => ({
        value: Math.round(rnd() * 100),
        name: `g${i}`,
      })),
    };
  },
  // Long-format radar rows are (series, indicator) cells.
  radar: (rows) => {
    const rnd = seededRandom(SEED);
    const indicators = range(6).map((k) => ({ name: `axis ${k}`, max: 100 }));
    return {
      data: {
        indicators,
        series: range(Math.ceil(rows / indicators.length)).map((i) => ({
          name: `s${i}`,
          values: indicators.map(() => Math.round(rnd() * 100)),
        })),
      },
    };
  },
  gantt: (rows) => {
    const rnd = seededRandom(SEED);
    const categories = ["Planning", "Development", "Testing", "Release"];
    return {
      data: range(rows).map((i) => {
        const start = GANTT_START + Math.floor(rnd() * 365) * DAY;
        return {
          task: `task ${i}`,
          start,
          end: start + (1 + Math.floor(rnd() * 30)) * DAY,
          category: categories[i % categories.length],
          progress: Math.round(rnd() * 100),
        };
      }),
    };
  },
  // Bipartite L -> R: every link unique (i < m*m) and no path returns.
  sankey: (rows) => {
    const rnd = seededRandom(SEED);
    const m = Math.ceil(Math.sqrt(rows));
    return {
      data: {
        nodes: [
          ...range(m).map((i) => ({ name: `L${i}` })),
          ...range(m).map((i) => ({ name: `R${i}` })),
        ],
        links: range(rows).map((i) => ({
          source: `L${i % m}`,
          target: `R${Math.floor(i / m)}`,
          value: 1 + Math.round(rnd() * 99),
        })),
      },
    };
  },
  sunburst: (rows) => ({ data: twoLevelTree(rows) }),
  treemap: (rows) => ({ data: twoLevelTree(rows) }),
  "circle-packing": (rows) => ({ data: twoLevelTree(rows) }),
  // 217 regions exist; past that the rows repeat names, which is what an
  // unaggregated query does too.
  choropleth: (rows) => {
    const rnd = seededRandom(SEED);
    return {
      data: range(rows).map((i) => ({
        name: REGION_NAMES[i % REGION_NAMES.length],
        value: Math.round(rnd() * 1000),
      })),
    };
  },
  map: (rows) => {
    const rnd = seededRandom(SEED);
    return {
      center: [20, 0],
      zoom: 2,
      markers: range(rows).map((i) => ({
        id: String(i),
        lat: -60 + rnd() * 130,
        lng: -180 + rnd() * 360,
        label: `marker ${i}`,
        value: 4 + Math.round(rnd() * 20),
      })),
    };
  },
  // A ring plus one random chord per node: connected, ~2 edges per node.
  graph: (rows) => {
    const rnd = seededRandom(SEED);
    return {
      nodes: range(rows).map((i) => ({
        id: `n${i}`,
        label: `Node ${i}`,
        labels: ["Bench"],
      })),
      edges: range(rows).flatMap((i) => [
        { source: `n${i}`, target: `n${(i + 1) % rows}`, label: "NEXT" },
        {
          source: `n${i}`,
          target: `n${Math.floor(rnd() * rows)}`,
          label: "LINK",
        },
      ]),
    };
  },
  // A stat tile has no rows; the count is the number it shows.
  "single-value": (rows) => ({ value: rows, title: "Rows" }),
};

export function benchmarkProps<C extends BenchmarkChart>(
  chart: C,
  rows: number,
): BenchmarkPropsMap[C] {
  // The mapped type is exact per key; TS cannot correlate the indexed call.
  return (generators[chart] as (rows: number) => BenchmarkPropsMap[C])(rows);
}
