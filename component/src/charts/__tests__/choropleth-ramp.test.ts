import { describe, it, expect } from "vitest";
import {
  buildSequentialRamp,
  rampFor,
  CHOROPLETH_SEQ,
  CHOROPLETH_DEFAULT_MIN_COLOR,
  CHOROPLETH_DEFAULT_MAX_COLOR,
} from "../choropleth-ramp";
import { MUTED_FILL, SURFACE_COLOR } from "../theme";

/**
 * #1404 — the choropleth's colour scale was not a scale.
 *
 * `visualMap.inRange.color` was `[minColor, "#fed98e", "#fe9929", "#d95f0e",
 * maxColor]`: two configurable ends spliced onto three hardcoded warm YlOrBr
 * stops. The shipped default paired those warm literals with ColorBrewer
 * *Blues* endpoints from the plugin schema, so the ramp ran
 * pale-blue → pale-yellow → orange → dark-orange → navy.
 *
 * Note the defect is HUE, not lightness. Measured, the old default ramp was
 * monotonically darkening (0.886 → 0.727 → 0.440 → 0.230 → 0.032), so a
 * luminance check alone passes on it and proves nothing — the issue's claim of
 * "non-monotonic in hue *and* in lightness" is half right. What actually broke
 * is that the interior stops do not lie on the ramp between the ends: the
 * sequence leaves blue for warm and returns to navy, so a reader cannot order
 * two regions by colour while the legend stays band-by-band correct and makes
 * the map look authoritative.
 *
 * It also left minColor/maxColor 60% dead — whatever a user picked, three of
 * the five stops ignored it.
 *
 * The matching assertion that the app plugin's defaults equal the constants
 * exported here lives in app/, which may import from component/ but not the
 * reverse.
 */

/** WCAG relative luminance, for asserting a ramp actually darkens. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

describe("buildSequentialRamp (#1404)", () => {
  it("starts and ends exactly on the configured colours", () => {
    const ramp = buildSequentialRamp("#fff7d6", "#993404", 5);
    expect(ramp[0].toLowerCase()).toBe("#fff7d6");
    expect(ramp[ramp.length - 1].toLowerCase()).toBe("#993404");
  });

  it("produces the requested number of stops", () => {
    expect(buildSequentialRamp("#ffffff", "#000000", 5)).toHaveLength(5);
    expect(buildSequentialRamp("#ffffff", "#000000", 3)).toHaveLength(3);
  });

  // The defect in one assertion: every interior stop must lie on the ramp
  // between the ends, so luminance moves in one direction throughout.
  it("is monotonic in luminance for the shipped defaults", () => {
    const ramp = buildSequentialRamp(
      CHOROPLETH_DEFAULT_MIN_COLOR,
      CHOROPLETH_DEFAULT_MAX_COLOR,
      5,
    );
    const lums = ramp.map(luminance);
    for (let i = 1; i < lums.length; i++) {
      expect(
        lums[i],
        `stop ${i} (${ramp[i]}) is not darker than stop ${i - 1} (${ramp[i - 1]})`,
      ).toBeLessThan(lums[i - 1]);
    }
  });

  it("is monotonic for a light-to-dark pair in either direction", () => {
    for (const [a, b] of [
      ["#ffffff", "#993404"],
      ["#08306b", "#e8f4f8"], // reversed: should ascend, not descend
      ["#ffffcc", "#006837"],
    ] as const) {
      const lums = buildSequentialRamp(a, b, 5).map(luminance);
      const ascending = lums[lums.length - 1] > lums[0];
      for (let i = 1; i < lums.length; i++) {
        expect(ascending ? lums[i] > lums[i - 1] : lums[i] < lums[i - 1]).toBe(
          true,
        );
      }
    }
  });

  // THE defect, stated as an invariant: every stop must be the interpolation
  // of the two ends at its position. The old ramp fails this at every interior
  // stop — between #e8f4f8 and #08306b the quarter-point red channel is 176,
  // but the shipped stop was #fed98e (254). This is the assertion a luminance
  // check cannot make.
  it("every interior stop lies on the line between the two ends", () => {
    const [min, max] = ["#e8f4f8", "#08306b"];
    const ramp = buildSequentialRamp(min, max, 5);
    const channel = (hex: string, i: number) =>
      parseInt(hex.replace("#", "").slice(i * 2, i * 2 + 2), 16);
    for (let stop = 0; stop < ramp.length; stop++) {
      const t = stop / (ramp.length - 1);
      for (let c = 0; c < 3; c++) {
        const expected =
          channel(min, c) + t * (channel(max, c) - channel(min, c));
        expect(
          Math.abs(channel(ramp[stop], c) - expected),
          `stop ${stop} channel ${c} is off the ramp (${ramp[stop]})`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  // The old shipped ramp, kept as a negative control: it is luminance-monotonic
  // yet plainly wrong, which is why the check above is the one that matters.
  it("rejects the old spliced ramp as off-line", () => {
    const old = ["#e8f4f8", "#fed98e", "#fe9929", "#d95f0e", "#08306b"];
    const correct = buildSequentialRamp("#e8f4f8", "#08306b", 5);
    expect(old).not.toEqual(correct);
    expect(old[1].toLowerCase()).not.toBe(correct[1].toLowerCase());
  });

  // What made minColor/maxColor half-dead: three of five stops ignored them.
  it("contains no hardcoded stop from the old warm ramp", () => {
    const ramp = buildSequentialRamp("#ffffff", "#000000", 5).map((c) =>
      c.toLowerCase(),
    );
    for (const literal of ["#fed98e", "#fe9929", "#d95f0e"]) {
      expect(ramp).not.toContain(literal);
    }
  });

  it("exports defaults that are a single coherent warm ramp", () => {
    expect(luminance(CHOROPLETH_DEFAULT_MIN_COLOR)).toBeGreaterThan(
      luminance(CHOROPLETH_DEFAULT_MAX_COLOR),
    );
  });
});

/** OKLCH [L, C, h°] of a hex, written out from Ottosson's published matrices. */
function oklch(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    Math.hypot(a, bb),
    ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  ];
}

/** WCAG 2.x contrast ratio: (L1 + 0.05) / (L2 + 0.05), lighter over darker. */
function wcagContrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * #2315 — a custom ramp in dark mode keeps its hue, and its lowest stop stays
 * visibly lighter than the no-data fill (owner decision: OKLCH flip, hue
 * carried, floor 1.5 : 1).
 */
describe("rampFor custom ends in dark mode (#2315)", () => {
  // Hues of green in OKLCH: yellowgreen #9acd32 sits at ~128 degrees, the
  // CSS teal-green #00a86b (jade) at ~160; ColorBrewer Greens ends at 136.6 (#f7fcf5) and 150.0 (#00441b).
  const GREEN_HUE = [125, 165] as const;
  const greens = rampFor(true, "#f7fcf5", "#00441b");

  it("keeps every green stop in the green hue range", () => {
    for (const stop of greens) {
      const [, , h] = oklch(stop);
      expect(h, stop).toBeGreaterThanOrEqual(GREEN_HUE[0]);
      expect(h, stop).toBeLessThanOrEqual(GREEN_HUE[1]);
    }
  });

  it("raises OKLCH lightness from stop 1 to stop 5", () => {
    const ls = greens.map((c) => oklch(c)[0]);
    for (let i = 1; i < 5; i++) expect(ls[i]).toBeGreaterThan(ls[i - 1]);
  });

  it("paints the lowest stop lighter than the no-data fill by 1.5 : 1", () => {
    expect(luminance(greens[0])).toBeGreaterThan(luminance(MUTED_FILL.dark));
    expect(wcagContrast(greens[0], MUTED_FILL.dark)).toBeGreaterThanOrEqual(
      1.5,
    );
    expect(luminance(greens[0])).toBeGreaterThan(luminance(SURFACE_COLOR.dark));
  });

  it("keeps the hues of two coloured ends, no carry", () => {
    const [min, max] = ["#99f6e4", "#134e4a"];
    const ramp = rampFor(true, min, max);
    expect(Math.abs(oklch(ramp[0])[2] - oklch(min)[2])).toBeLessThan(2);
    expect(Math.abs(oklch(ramp[4])[2] - oklch(max)[2])).toBeLessThan(2);
  });

  // After the flip the order of the ends is the reverse of the input's; the
  // floor may close the gap but never cross it (nor leave the rounding noise).
  it.each([
    ["reversed", "#00441b", "#f7fcf5"],
    ["near-equal", "#e0ece0", "#d0dcd0"],
    ["identical", "#f0f8f0", "#f0f8f0"],
  ])("a %s pair never lets the floor pass the other end", (_n, min, max) => {
    const ramp = rampFor(true, min, max);
    const flippedGap = oklch(min)[0] - oklch(max)[0]; // hi - lo after the flip
    const gap = oklch(ramp[4])[0] - oklch(ramp[0])[0];
    expect(Math.sign(Math.round(gap * 100))).toBe(
      Math.sign(Math.round(flippedGap * 100)),
    );
  });

  // Light-on-light pairs flip to dark-on-dark; both ends lift together, keeping
  // their gap, until the lowest clears the no-data fill (owner default).
  it.each([
    ["white to yellow", "#ffffff", "#ffff00"],
    ["white to pale grey", "#ffffff", "#eeeeee"],
    ["pale greens", "#e0ece0", "#d0dcd0"],
    ["white to red", "#ffffff", "#ff0000"],
    ["identical", "#f0f8f0", "#f0f8f0"],
  ])("%s: stop 1 clears the no-data fill by 1.5 : 1", (_n, min, max) => {
    const ramp = rampFor(true, min, max);
    expect(wcagContrast(ramp[0], MUTED_FILL.dark)).toBeGreaterThanOrEqual(1.5);
    expect(luminance(ramp[0])).toBeGreaterThan(luminance(MUTED_FILL.dark));
  });

  it.each([
    ["white to yellow", "#ffffff", "#ffff00"],
    ["white to pale grey", "#ffffff", "#eeeeee"],
    ["pale greens", "#e0ece0", "#d0dcd0"],
    ["white to red", "#ffffff", "#ff0000"],
  ])("%s: the stops still rise in lightness", (_n, min, max) => {
    const ls = rampFor(true, min, max).map((c) => oklch(c)[0]);
    for (let i = 1; i < 5; i++) expect(ls[i]).toBeGreaterThan(ls[i - 1]);
  });
});

describe("rampFor (#2230)", () => {
  const LIGHT = [...CHOROPLETH_SEQ.light];
  const DARK = [...CHOROPLETH_SEQ.dark];

  // Widgets saved before the citrine ramp carry the YlOrBr or Blues pair in
  // their settings; left as "custom" they would paint the old ramp.
  it.each([
    [
      "citrine ends",
      CHOROPLETH_DEFAULT_MIN_COLOR,
      CHOROPLETH_DEFAULT_MAX_COLOR,
    ],
    ["legacy YlOrBr", "#fff7d6", "#993404"],
    ["legacy Blues", "#e8f4f8", "#08306b"],
    ["legacy Blues, upper case", "#E8F4F8", "#08306B"],
    [
      "citrine ends, lower case",
      CHOROPLETH_DEFAULT_MIN_COLOR.toLowerCase(),
      CHOROPLETH_DEFAULT_MAX_COLOR.toLowerCase(),
    ],
  ])("%s paint the themed ramp", (_n, min, max) => {
    expect(rampFor(false, min, max)).toEqual(LIGHT);
    expect(rampFor(true, min, max)).toEqual(DARK);
  });

  it("builds a custom pair end to end in light mode", () => {
    expect(rampFor(false, "#ffffff", "#ff0000")).toEqual(
      buildSequentialRamp("#ffffff", "#ff0000", 5),
    );
  });

  it("one legacy end alone is a custom pair", () => {
    expect(rampFor(false, "#fff7d6", "#ff0000")).toEqual(
      buildSequentialRamp("#fff7d6", "#ff0000", 5),
    );
  });
});
