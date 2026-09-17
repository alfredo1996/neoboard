import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BENCHMARK_CHARTS,
  BENCHMARK_ROW_COUNTS,
  benchmarkProps,
  seededRandom,
} from "./fixtures/benchmark-data";
import type { SankeyChartData } from "../sankey-chart";
import type { GraphEdge, GraphNode } from "../types";
import type { ChoroplethDataItem } from "../choropleth-chart";
import type { RadarChartData } from "../radar-chart";

// The benchmark (#1688) is only comparable run-to-run if every story mounts
// byte-identical data, so nothing here may touch Math.random.

describe("seededRandom", () => {
  it("is deterministic for a seed and different across seeds", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const c = seededRandom(8);
    const runA = [a(), a(), a()];
    expect(runA).toEqual([b(), b(), b()]);
    expect(runA).not.toEqual([c(), c(), c()]);
    for (const v of runA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("benchmarkProps", () => {
  it("covers every chart story under stories/charts at both row counts", () => {
    // Derived from disk so a new chart story without a benchmark row fails
    // here rather than silently missing from the table.
    // vitest runs with cwd = component/ (jsdom rewrites import.meta.url).
    const onDisk = readdirSync(join(process.cwd(), "stories/charts"))
      .filter((f) => f.endsWith("-chart.stories.tsx"))
      .map((f) => f.replace("-chart.stories.tsx", ""))
      .sort();
    expect(onDisk.length).toBeGreaterThan(10);
    expect([...BENCHMARK_CHARTS].sort()).toEqual(onDisk);
    expect(BENCHMARK_ROW_COUNTS).toEqual([1000, 10000]);
  });

  it("returns the same props for the same chart and row count", () => {
    for (const chart of BENCHMARK_CHARTS) {
      expect(benchmarkProps(chart, 1000)).toEqual(benchmarkProps(chart, 1000));
    }
  });

  it.each(BENCHMARK_ROW_COUNTS)(
    "emits exactly %i rows for flat charts",
    (n) => {
      expect(benchmarkProps("bar", n).data).toHaveLength(n);
      expect(benchmarkProps("line", n).data).toHaveLength(n);
      expect(benchmarkProps("pie", n).data).toHaveLength(n);
      expect(benchmarkProps("gantt", n).data).toHaveLength(n);
      expect(benchmarkProps("gauge", n).data).toHaveLength(n);
      expect(benchmarkProps("choropleth", n).data).toHaveLength(n);
      expect(benchmarkProps("map", n).markers).toHaveLength(n);
      expect(benchmarkProps("sankey", n).data.links).toHaveLength(n);
      expect(benchmarkProps("graph", n).nodes).toHaveLength(n);
    },
  );

  it.each(BENCHMARK_ROW_COUNTS)(
    "hierarchical charts carry %i leaves under a two-level tree",
    (n) => {
      for (const chart of ["sunburst", "treemap", "circle-packing"] as const) {
        const groups = benchmarkProps(chart, n).data;
        const leaves = groups.flatMap((g) => g.children ?? []);
        expect(leaves).toHaveLength(n);
        expect(leaves.every((l) => typeof l.value === "number")).toBe(true);
      }
    },
  );

  it("radar rows are series x indicator cells", () => {
    const data = benchmarkProps("radar", 1000).data as RadarChartData;
    const cells = data.series.length * data.indicators.length;
    expect(cells).toBeGreaterThanOrEqual(1000);
    expect(cells).toBeLessThan(1000 + data.indicators.length);
    for (const s of data.series) {
      expect(s.values).toHaveLength(data.indicators.length);
    }
  });

  it("sankey links are unique, acyclic and point at declared nodes", () => {
    const data = benchmarkProps("sankey", 10000).data as SankeyChartData;
    const names = new Set(data.nodes.map((n) => n.name));
    expect(names.size).toBe(data.nodes.length);
    const pairs = new Set(data.links.map((l) => `${l.source}>${l.target}`));
    expect(pairs.size).toBe(data.links.length);
    for (const l of data.links) {
      expect(names.has(l.source)).toBe(true);
      expect(names.has(l.target)).toBe(true);
      // Left column feeds the right column only — no path can return.
      expect(l.source.startsWith("L")).toBe(true);
      expect(l.target.startsWith("R")).toBe(true);
      expect(l.value).toBeGreaterThan(0);
    }
  });

  it("graph edges reference existing nodes", () => {
    const { nodes, edges } = benchmarkProps("graph", 1000) as {
      nodes: GraphNode[];
      edges: GraphEdge[];
    };
    const ids = new Set(nodes.map((n) => n.id));
    expect(edges.length).toBeGreaterThanOrEqual(nodes.length);
    for (const e of edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it("choropleth names are regions the world map knows", async () => {
    const world = (await import("../world.geo.json")) as {
      features: { properties: { name: string } }[];
    };
    const known = new Set(world.features.map((f) => f.properties.name));
    const data = benchmarkProps("choropleth", 1000)
      .data as ChoroplethDataItem[];
    expect(data.every((d) => known.has(d.name))).toBe(true);
  });

  it("map markers stay inside real coordinates", () => {
    for (const m of benchmarkProps("map", 10000).markers ?? []) {
      expect(m.lat).toBeGreaterThanOrEqual(-85);
      expect(m.lat).toBeLessThanOrEqual(85);
      expect(m.lng).toBeGreaterThanOrEqual(-180);
      expect(m.lng).toBeLessThanOrEqual(180);
    }
  });

  it("gantt tasks end after they start", () => {
    for (const t of benchmarkProps("gantt", 1000).data) {
      expect(t.end).toBeGreaterThan(t.start);
    }
  });

  it("single-value has no rows to scale, so the row count is its value", () => {
    expect(benchmarkProps("single-value", 10000).value).toBe(10000);
  });
});
