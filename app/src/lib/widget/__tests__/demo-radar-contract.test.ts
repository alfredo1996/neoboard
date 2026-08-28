import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Contract guard for demo radar widgets (#1510).
 *
 * A radar chart draws every indicator on radial axes that share nothing but
 * the centre — so when one query mixes indicators whose values differ by
 * orders of magnitude, every smaller axis collapses to a point. The Chart
 * Gallery radar plots raw row counts (order_items ≈ 6000, products = 100),
 * which rendered as a single spike with four dead axes.
 *
 * The radar transform supports a per-indicator `max` column exactly for this
 * (`app/src/plugins/radar/transform.ts`), and the demo is the place that
 * feature should be exercised. This test pins that every multi-indicator
 * radar query in the showcases carries one.
 *
 * Same pattern (and same reason for living in app/, which CI runs) as
 * demo-form-contract.test.ts.
 */

const DEMO_DIR = join(process.cwd(), "..", "scripts", "demo");

interface Widget {
  chartType?: string;
  query?: string;
}

function collectRadarWidgets(node: unknown, out: Widget[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectRadarWidgets(n, out);
  } else if (node && typeof node === "object") {
    const w = node as Widget;
    if (w.chartType === "radar" && typeof w.query === "string") out.push(w);
    for (const v of Object.values(node)) collectRadarWidgets(v, out);
  }
}

function allRadarWidgets(): Widget[] {
  const out: Widget[] = [];
  for (const f of readdirSync(DEMO_DIR).filter((x) => x.endsWith(".json"))) {
    collectRadarWidgets(
      JSON.parse(readFileSync(join(DEMO_DIR, f), "utf8")),
      out,
    );
  }
  return out;
}

describe("demo radar widgets — per-indicator max (#1510)", () => {
  it("discovers radar widgets across the showcases", () => {
    // Guards the sweep — an empty list would make the assertion below vacuous.
    expect(allRadarWidgets().length).toBeGreaterThan(0);
  });

  it("every multi-indicator radar query supplies a max column", () => {
    for (const w of allRadarWidgets()) {
      const q = w.query!;
      // Long-format radar: one row per indicator, assembled with UNION ALL.
      // Those are the queries where indicators come from different sources
      // and share no natural scale.
      if (!/union\s+all/i.test(q)) continue;
      expect(
        /\bas\s+max\b/i.test(q),
        `radar query mixes indicators via UNION ALL without a per-indicator max:\n${q}`,
      ).toBe(true);
    }
  });
});
