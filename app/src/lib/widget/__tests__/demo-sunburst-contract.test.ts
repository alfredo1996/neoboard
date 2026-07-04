import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Contract guard for the demo sunburst widgets (#1159).
 *
 * A sunburst with only `name, value` rows renders a single flat ring — it
 * demonstrates nothing a pie doesn't. Every seeded sunburst must return a
 * `parent` column so the hierarchical transform builds nested rings.
 */

const DEMO_DIR = join(process.cwd(), "..", "scripts", "demo");

interface Widget {
  id?: string;
  chartType?: string;
  query?: string;
}

function collectSunbursts(node: unknown, out: Widget[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectSunbursts(n, out);
  } else if (node && typeof node === "object") {
    const w = node as Widget;
    if (w.chartType === "sunburst" && typeof w.query === "string") out.push(w);
    for (const v of Object.values(node)) collectSunbursts(v, out);
  }
}

describe("demo sunburst widgets are hierarchical (#1159)", () => {
  const files = readdirSync(DEMO_DIR).filter((f) => f.endsWith(".json"));
  const all: { file: string; w: Widget }[] = [];
  for (const f of files) {
    const widgets: Widget[] = [];
    collectSunbursts(
      JSON.parse(readFileSync(join(DEMO_DIR, f), "utf8")),
      widgets,
    );
    for (const w of widgets) all.push({ file: f, w });
  }

  it("finds sunburst widgets in the showcases", () => {
    expect(all.length).toBeGreaterThan(0);
  });

  for (const { file, w } of all) {
    // The playground sunburst is a parameter-switching demo (its dimension is
    // the interactive knob); hierarchy is demonstrated by gallery + reference.
    if (w.id === "dist-sunburst") continue;
    it(`${file}: ${w.id} returns a parent column (multi-ring)`, () => {
      expect(w.query!.toLowerCase()).toContain(" as parent");
    });
  }
});
