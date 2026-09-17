/**
 * Global setup and teardown of the chart render benchmark (#1688).
 *
 * The spec appends each sample to a file as it is measured; the teardown
 * prints the table and writes results.json from that file. Module state in
 * the spec would not survive a failure: Playwright restarts the worker after
 * a failed test and re-imports the spec, so the table would print in two
 * halves and results.json would be overwritten without the samples taken
 * before the failure — on exactly the run where they matter.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BENCHMARK_BUDGET_MS,
  formatBenchmarkReport,
  type BenchmarkSample,
} from "../src/charts/__tests__/fixtures/benchmark-report";

export const BENCHMARK_OUT_DIR = fileURLToPath(
  new URL("../../design-shots/benchmark", import.meta.url),
);
export const BENCHMARK_SAMPLES = path.join(BENCHMARK_OUT_DIR, "samples.jsonl");

export default function globalSetup() {
  mkdirSync(BENCHMARK_OUT_DIR, { recursive: true });
  writeFileSync(BENCHMARK_SAMPLES, "");

  return () => {
    const samples = readFileSync(BENCHMARK_SAMPLES, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as BenchmarkSample);
    if (samples.length === 0) return;
    console.log(formatBenchmarkReport(samples));
    writeFileSync(
      path.join(BENCHMARK_OUT_DIR, "results.json"),
      JSON.stringify(
        {
          date: new Date().toISOString(),
          budgetMs: BENCHMARK_BUDGET_MS,
          samples,
        },
        null,
        2,
      ),
    );
  };
}
