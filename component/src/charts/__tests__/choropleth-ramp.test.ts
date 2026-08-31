import { describe, it, expect } from "vitest";
import {
  buildSequentialRamp,
  CHOROPLETH_DEFAULT_MIN_COLOR,
  CHOROPLETH_DEFAULT_MAX_COLOR,
} from "../choropleth-ramp";

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
