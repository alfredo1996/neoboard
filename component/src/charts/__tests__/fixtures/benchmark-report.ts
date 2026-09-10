/**
 * The printed table of the per-chart render benchmark (#1688).
 *
 * Pure so it can be unit-tested (`../benchmark-report.test.ts`): the
 * Playwright spec never fails on a number, so nothing else would notice a
 * broken minimum or budget comparison. The spec appends samples; the global
 * teardown (`e2e/benchmark-global-setup.ts`) formats them with this.
 */
import {
  BENCHMARK_CHARTS,
  type BenchmarkChart,
  type BenchmarkRows,
} from "./benchmark-data";

export interface BenchmarkSample {
  chart: BenchmarkChart;
  rows: BenchmarkRows;
  theme: "light" | "dark";
  ms: number;
}

export type BenchmarkBudgets = Record<
  BenchmarkChart,
  Record<BenchmarkRows, number>
>;

/** The issue's starting budget; tune a chart's own entry after the runs settle. */
const START = { 1000: 300, 10000: 1500 } as const;

export const BENCHMARK_BUDGET_MS: BenchmarkBudgets = {
  bar: START,
  line: START,
  pie: START,
  gauge: START,
  radar: START,
  gantt: START,
  sankey: START,
  sunburst: START,
  treemap: START,
  "circle-packing": START,
  choropleth: START,
  map: START,
  graph: START,
  "single-value": START,
};

/**
 * One table cell. Light and dark are the same work, so they are two samples
 * of one number and the best is reported: a 10k NVL layout still winding
 * down as the next story mounts slows whichever sample runs first.
 */
export function benchmarkCell(
  samples: readonly BenchmarkSample[],
  chart: BenchmarkChart,
  rows: BenchmarkRows,
  budgets: BenchmarkBudgets = BENCHMARK_BUDGET_MS,
): string {
  const runs = samples.filter((s) => s.chart === chart && s.rows === rows);
  if (runs.length === 0) return "—";
  const ms = Math.round(Math.min(...runs.map((s) => s.ms)));
  return `${ms}${ms > budgets[chart][rows] ? " !" : ""}`;
}

export function formatBenchmarkReport(
  samples: readonly BenchmarkSample[],
  budgets: BenchmarkBudgets = BENCHMARK_BUDGET_MS,
): string {
  const col = (s: string) => s.padEnd(9);
  return [
    "",
    "Chart render benchmark — mount → whole chart drawn, best of light/dark (ms)",
    `${"chart".padEnd(16)} ${col("1k")} ${col("10k")} budget`,
    ...BENCHMARK_CHARTS.map(
      (c) =>
        `${c.padEnd(16)} ${col(benchmarkCell(samples, c, 1000, budgets))} ${col(benchmarkCell(samples, c, 10000, budgets))} ≤${budgets[c][1000]} / ≤${budgets[c][10000]}`,
    ),
    "! = over that chart's budget (a report, not a gate)",
    "",
  ].join("\n");
}
