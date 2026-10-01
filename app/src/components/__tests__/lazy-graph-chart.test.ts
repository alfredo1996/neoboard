// NVL (WebGL, mobx) is browser-only: one static GraphChart import evaluated it
// in every server bundle that renders a dashboard (#2059).
import { describe, it, expect, vi } from "vitest";
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dynamicOptions = vi.hoisted((): unknown[] => []);
vi.mock("next/dynamic", () => ({
  default: (_loader: unknown, options: unknown) => {
    dynamicOptions.push(options);
    return () => null;
  },
}));
vi.mock("@neoboard/components", () => ({ Skeleton: () => null }));

const SRC = join(import.meta.dirname, "..", "..");
// A value import naming GraphChart; `import type` and GraphChartProps never match.
const STATIC_GRAPH_CHART =
  /import\s*\{[^}]*\bGraphChart\b[^}]*\}\s*from\s*["']@neoboard\/components/;

describe("GraphChart loads only in the browser (#2059)", () => {
  it("no app module imports it statically", () => {
    const offenders = globSync("**/*.{ts,tsx}", { cwd: SRC }).filter(
      (file) =>
        !file.includes("__tests__") &&
        STATIC_GRAPH_CHART.test(readFileSync(join(SRC, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("the one lazy GraphChart skips server rendering", async () => {
    await import("../lazy-graph-chart");
    expect(dynamicOptions).toEqual([expect.objectContaining({ ssr: false })]);
  });
});
