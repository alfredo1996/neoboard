/**
 * Regression guard for #919.
 *
 * ECharts does not accept the CSS keyword `"inherit"` as a color — when it
 * sees one, it silently falls back to its built-in mid-gray and ignores the
 * registered theme. The result: chart labels with broken contrast on dark
 * backgrounds and a regression that's invisible in code review.
 *
 * The cure is simple: omit `color` entirely so ECharts inherits from the
 * global `textStyle.color` set in theme.ts. This test fails if anyone
 * re-introduces the broken idiom.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHARTS_DIR = join(__dirname, "..");

function listChartFiles(): string[] {
  return readdirSync(CHARTS_DIR)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => join(CHARTS_DIR, f))
    .filter((p) => statSync(p).isFile());
}

// Matches `color: "inherit"` and `color: 'inherit'` with optional whitespace.
// We intentionally leave `color: \`inherit\`` (template literals) to be
// caught manually — template literals around a static color string would be
// a different code smell.
const INHERIT_COLOR = /color\s*:\s*["']inherit["']/;

describe("ECharts theme integration", () => {
  it("no chart component uses color: 'inherit' (#919)", () => {
    const offenders: string[] = [];
    for (const file of listChartFiles()) {
      const source = readFileSync(file, "utf8");
      const lines = source.split("\n");
      lines.forEach((line, idx) => {
        if (INHERIT_COLOR.test(line)) {
          offenders.push(`${file}:${idx + 1}  ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
