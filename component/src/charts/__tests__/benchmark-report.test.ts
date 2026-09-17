import { describe, expect, it } from "vitest";
import { BENCHMARK_CHARTS } from "./fixtures/benchmark-data";
import {
  BENCHMARK_BUDGET_MS,
  benchmarkCell,
  formatBenchmarkReport,
  type BenchmarkSample,
} from "./fixtures/benchmark-report";

// component/CHARTS.md is copied from this table (#1688). The benchmark spec
// never fails on a number, so a wrong minimum or a flipped budget comparison
// would print a wrong table with every run green — hence these.

const sample = (over: Partial<BenchmarkSample> = {}): BenchmarkSample => ({
  chart: "bar",
  rows: 1000,
  theme: "light",
  ms: 100,
  ...over,
});

describe("benchmarkCell", () => {
  it("reports the faster of the light and dark samples, rounded", () => {
    const samples = [
      sample({ theme: "light", ms: 250.6 }),
      sample({ theme: "dark", ms: 180.4 }),
    ];
    expect(benchmarkCell(samples, "bar", 1000)).toBe("180");
  });

  it("marks a cell over budget and leaves one exactly on budget unmarked", () => {
    expect(benchmarkCell([sample({ ms: 301 })], "bar", 1000)).toBe("301 !");
    expect(benchmarkCell([sample({ ms: 300 })], "bar", 1000)).toBe("300");
  });

  it("compares against the chart's own budget, not one per row count", () => {
    const budgets = {
      ...BENCHMARK_BUDGET_MS,
      pie: { 1000: 100, 10000: 1500 },
    };
    const samples = [sample({ chart: "pie", ms: 150 }), sample({ ms: 150 })];
    expect(benchmarkCell(samples, "pie", 1000, budgets)).toBe("150 !");
    expect(benchmarkCell(samples, "bar", 1000, budgets)).toBe("150");
  });

  it("only reads samples for its own chart and row count", () => {
    const samples = [
      sample({ chart: "pie", ms: 5 }),
      sample({ rows: 10000, ms: 7 }),
      sample({ ms: 120 }),
    ];
    expect(benchmarkCell(samples, "bar", 1000)).toBe("120");
  });

  it("renders a cell with no samples as a dash", () => {
    expect(benchmarkCell([sample({ chart: "pie" })], "bar", 1000)).toBe("—");
  });
});

describe("formatBenchmarkReport", () => {
  it("prints one row per chart: both row counts, then that chart's budget", () => {
    const report = formatBenchmarkReport([
      sample({ ms: 108 }),
      sample({ rows: 10000, ms: 1600 }),
    ]);
    expect(report).toMatch(/^bar +108 +1600 ! +≤300 \/ ≤1500$/m);
    for (const chart of BENCHMARK_CHARTS) {
      expect(report).toMatch(new RegExp(`^${chart} `, "m"));
    }
  });
});
