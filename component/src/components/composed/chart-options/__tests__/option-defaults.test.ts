import { describe, it, expect } from "vitest";
import { CHART_TYPES_WITH_OPTIONS, getChartOptions } from "../index";
import { getPaletteColors, resolvePaletteId } from "@/charts/palettes";

/**
 * #1520 — the Color Palette option declared `default: "deep-ocean"`, which is
 * not a key in `COLOR_PALETTES` but an entry in the backwards-compatibility
 * alias map. Its `options` are built from `COLOR_PALETTES`, so the default
 * matched no item and the control rendered empty on every chart.
 *
 * Written as a sweep over every option of every chart type rather than a
 * single assertion about `colorPalette`: the defect is a class, and the same
 * mistake in any future option is caught for free.
 */
describe("select option defaults are selectable (#1520)", () => {
  it("covers every registered chart type", () => {
    // Guards the sweep itself — an empty list would make the loops below pass
    // while asserting nothing.
    expect(CHART_TYPES_WITH_OPTIONS.length).toBeGreaterThan(10);
  });

  for (const chartType of CHART_TYPES_WITH_OPTIONS) {
    it(`${chartType}: every select default appears in its own options`, () => {
      for (const option of getChartOptions(chartType)) {
        if (option.type !== "select" || option.default === undefined) continue;
        const values = (option.options ?? []).map((o) => o.value);
        expect(
          values,
          `${chartType}.${option.key} defaults to "${String(option.default)}", which is not one of its options`,
        ).toContain(String(option.default));
      }
    });
  }
});

describe("resolvePaletteId", () => {
  it("maps a legacy alias to its canonical palette", () => {
    expect(resolvePaletteId("deep-ocean")).toBe("citrine");
    expect(resolvePaletteId("warm-sunset")).toBe("warm");
    expect(resolvePaletteId("cool-breeze")).toBe("cool");
    expect(resolvePaletteId("neon")).toBe("observable");
  });

  it("returns a canonical id unchanged", () => {
    expect(resolvePaletteId("citrine")).toBe("citrine");
    expect(resolvePaletteId("tableau")).toBe("tableau");
  });

  it("returns an unknown id unchanged, so callers can decide", () => {
    expect(resolvePaletteId("not-a-palette")).toBe("not-a-palette");
  });

  it("agrees with getPaletteColors on which ids resolve", () => {
    for (const id of ["deep-ocean", "warm-sunset", "cool-breeze", "neon"]) {
      expect(getPaletteColors(id)).toEqual(
        getPaletteColors(resolvePaletteId(id)),
      );
    }
  });
});
