import { describe, it, expect } from "vitest";
import { CITRINE_LIGHT, CITRINE_DARK } from "../theme";

/**
 * Colorblind-safety contract for the Citrine chart palette (#821).
 *
 * Simulates protanopia / deuteranopia / tritanopia (Viénot et al. 1999,
 * applied in linear RGB) and asserts the minimum pairwise CIE76 deltaE
 * stays above thresholds — for the critical first 5 colors (typical
 * series count) and for the full 10.
 *
 * Reference: the old Deep Ocean palette scored as low as deltaE 4 (protan,
 * all-10) and 8 (tritan, first-5). Citrine was optimized to dominate it on
 * every axis; these thresholds lock that in.
 */

const hsl2rgb = (h: number, s: number, l: number): number[] => {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};
const srgb2lin = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const lin2srgb = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

const SIM_MATRICES: Record<string, number[][]> = {
  protan: [
    [0.11238, 0.88762, 0],
    [0.11238, 0.88762, 0],
    [0.00401, -0.00401, 1],
  ],
  deutan: [
    [0.29275, 0.70725, 0],
    [0.29275, 0.70725, 0],
    [-0.02234, 0.02234, 1],
  ],
  tritan: [
    [1, 0.14461, -0.14461],
    [0, 0.85924, 0.14076],
    [0, 0.85924, 0.14076],
  ],
};

const simulate = (rgb: number[], kind: string): number[] => {
  const lin = rgb.map(srgb2lin);
  return SIM_MATRICES[kind].map((row) =>
    lin2srgb(
      Math.max(
        0,
        Math.min(1, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]),
      ),
    ),
  );
};

const rgb2lab = ([r, g, b]: number[]): number[] => {
  let x = 0.4124 * srgb2lin(r) + 0.3576 * srgb2lin(g) + 0.1805 * srgb2lin(b);
  let y = 0.2126 * srgb2lin(r) + 0.7152 * srgb2lin(g) + 0.0722 * srgb2lin(b);
  let z = 0.0193 * srgb2lin(r) + 0.1192 * srgb2lin(g) + 0.9505 * srgb2lin(b);
  x /= 0.95047;
  z /= 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};

const deltaE = (a: number[], b: number[]): number => {
  const la = rgb2lab(a);
  const lb = rgb2lab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
};

function parseHsl(c: string): number[] {
  const m = c.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!m) throw new Error(`unparseable color: ${c}`);
  return hsl2rgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

function minPairwise(colors: string[], kind: string): number {
  const rgbs = colors.map(parseHsl);
  const sims = kind === "normal" ? rgbs : rgbs.map((c) => simulate(c, kind));
  let min = Infinity;
  for (let i = 0; i < sims.length; i++) {
    for (let j = i + 1; j < sims.length; j++) {
      min = Math.min(min, deltaE(sims[i], sims[j]));
    }
  }
  return min;
}

const VISIONS = ["normal", "protan", "deutan", "tritan"] as const;

describe.each([
  ["CITRINE_LIGHT", CITRINE_LIGHT],
  ["CITRINE_DARK", CITRINE_DARK],
])("%s colorblind safety (#821)", (_name, palette) => {
  it("anchors on the citrine amber accent", () => {
    expect(palette[0]).toMatch(/^hsl\(38, 95%, 5\d%\)$/);
  });

  it.each(VISIONS)(
    "first 5 colors keep min deltaE ≥ 20 under %s vision",
    (kind) => {
      expect(minPairwise(palette.slice(0, 5), kind)).toBeGreaterThanOrEqual(20);
    },
  );

  it.each(VISIONS)(
    "all 10 colors keep min deltaE ≥ 9 under %s vision",
    (kind) => {
      expect(minPairwise(palette, kind)).toBeGreaterThanOrEqual(9);
    },
  );
});
