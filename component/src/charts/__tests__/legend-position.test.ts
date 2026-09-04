import { describe, it, expect } from "vitest";
import {
  buildLegend,
  buildCompactGrid,
  resolveShowLegend,
} from "../chart-utils";

/**
 * #1592 — the legend is bottom-aligned everywhere, per the design system
 * (design-review skill §4: `legend: { bottom: 0 }` ALWAYS). The top/left/right
 * positions and the side-gap arithmetic that supported them are gone; pie and
 * radar were already bottom-only.
 */
describe("buildLegend", () => {
  it("returns a bottom-aligned scroll legend when shown", () => {
    expect(buildLegend(true)).toEqual({ type: "scroll", bottom: 0 });
  });

  it("returns undefined when hidden", () => {
    expect(buildLegend(false)).toBeUndefined();
  });
});

describe("buildCompactGrid", () => {
  it("reserves room at the bottom for the legend and nowhere else", () => {
    const grid = buildCompactGrid(false, true);
    expect(grid.bottom).toBe(40);
    expect(grid.left).toBe(16);
    expect(grid.right).toBe(16);
    expect(grid.top).toBe(16);
  });

  it("reclaims the bottom room when there is no legend", () => {
    expect(buildCompactGrid(false, false).bottom).toBe(24);
    expect(buildCompactGrid(true, false).bottom).toBe(8);
  });

  it("tightens every margin in compact mode", () => {
    const grid = buildCompactGrid(true, true);
    expect(grid.left).toBe(8);
    expect(grid.right).toBe(8);
    expect(grid.top).toBe(8);
  });
});

describe("resolveShowLegend", () => {
  it("shows a legend only once there is more than one series", () => {
    // The whole point of #1592: a one-swatch legend identifies nothing, it
    // just repeats the axis label. This branch was unreachable while the
    // schemas defaulted showLegend to true.
    expect(resolveShowLegend(undefined, 1, false)).toBe(false);
    expect(resolveShowLegend(undefined, 2, false)).toBe(true);
  });

  it("lets an explicit choice win over the auto rule", () => {
    expect(resolveShowLegend(true, 1, false)).toBe(true);
    expect(resolveShowLegend(false, 5, false)).toBe(false);
  });

  it("still hides the legend in a short container whatever the setting", () => {
    expect(resolveShowLegend(true, 5, true)).toBe(false);
  });
});
