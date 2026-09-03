import { describe, it, expect } from "vitest";
import {
  COLOR_PALETTES,
  getPaletteColors,
  resolvePaletteId,
  type ColorPalette,
} from "../palettes";

describe("COLOR_PALETTES", () => {
  it("contains at least 5 predefined palettes", () => {
    expect(Object.keys(COLOR_PALETTES).length).toBeGreaterThanOrEqual(5);
  });

  it("contains 'citrine' as the default palette (#821)", () => {
    expect(COLOR_PALETTES["citrine"]).toBeDefined();
  });

  it("every palette has a label string", () => {
    for (const [, palette] of Object.entries(COLOR_PALETTES)) {
      expect(typeof palette.label).toBe("string");
      expect(palette.label.length).toBeGreaterThan(0);
    }
  });

  it("every palette has exactly 10 colors", () => {
    for (const [id, palette] of Object.entries(COLOR_PALETTES)) {
      expect(
        palette.colors,
        `palette "${id}" should have 10 colors`,
      ).toHaveLength(10);
    }
  });

  it("every color in every palette is a non-empty string", () => {
    for (const [, palette] of Object.entries(COLOR_PALETTES)) {
      for (const color of palette.colors) {
        expect(typeof color).toBe("string");
        expect(color.length).toBeGreaterThan(0);
      }
    }
  });

  it("'citrine' palette label contains 'Default'", () => {
    expect(COLOR_PALETTES["citrine"].label).toContain("Default");
  });

  it("no palette except citrine claims to be the default", () => {
    for (const [id, palette] of Object.entries(COLOR_PALETTES)) {
      if (id === "citrine") continue;
      expect(palette.label, id).not.toContain("Default");
    }
  });

  it("contains 'tableau' palette", () => {
    expect(COLOR_PALETTES["tableau"]).toBeDefined();
  });

  it("contains 'observable' palette", () => {
    expect(COLOR_PALETTES["observable"]).toBeDefined();
  });

  it("contains 'sequential' palette", () => {
    expect(COLOR_PALETTES["sequential"]).toBeDefined();
  });

  it("contains 'diverging' palette", () => {
    expect(COLOR_PALETTES["diverging"]).toBeDefined();
  });

  it("contains 'monochrome' palette", () => {
    expect(COLOR_PALETTES["monochrome"]).toBeDefined();
  });

  it("contains 'earth-tones' as a distinct palette (not aliased to monochrome)", () => {
    expect(COLOR_PALETTES["earth-tones"]).toBeDefined();
    expect(COLOR_PALETTES["earth-tones"].colors).toHaveLength(10);
    expect(COLOR_PALETTES["earth-tones"].colors).not.toEqual(
      COLOR_PALETTES["monochrome"].colors,
    );
  });

  it("citrine colors match CITRINE_LIGHT from theme, amber first (#821)", () => {
    const citrine = COLOR_PALETTES["citrine"];
    expect(citrine.colors[0]).toBe("hsl(38, 95%, 55%)"); // Citrine amber anchor
  });

  it("legacy 'deep-ocean' id aliases to the citrine default (#821)", () => {
    expect(getPaletteColors("deep-ocean")).toEqual(
      COLOR_PALETTES["citrine"].colors,
    );
  });
});

describe("getPaletteColors", () => {
  it("returns colors array for a valid palette id", () => {
    const colors = getPaletteColors("deep-ocean");
    expect(colors).toBeDefined();
    expect(Array.isArray(colors)).toBe(true);
    expect(colors!.length).toBe(10);
  });

  it("returns colors for all defined palettes", () => {
    for (const id of Object.keys(COLOR_PALETTES)) {
      const colors = getPaletteColors(id);
      expect(
        colors,
        `getPaletteColors("${id}") should return colors`,
      ).toBeDefined();
      expect(colors!.length).toBe(10);
    }
  });

  it("returns undefined for an unknown palette id", () => {
    expect(getPaletteColors("does-not-exist")).toBeUndefined();
  });

  it("returns the same reference as COLOR_PALETTES[id].colors", () => {
    const colors = getPaletteColors("tableau");
    expect(colors).toBe(COLOR_PALETTES["tableau"].colors);
  });
});

describe("resolvePaletteId", () => {
  it("maps legacy ids onto the palette they were renamed to", () => {
    // base-chart gates the theme-aware colour path on this resolving to
    // "citrine", so an alias regression would repaint every default chart
    // with the light array in dark mode (#1295).
    expect(resolvePaletteId("deep-ocean")).toBe("citrine");
    expect(resolvePaletteId("warm-sunset")).toBe("warm");
    expect(resolvePaletteId("cool-breeze")).toBe("cool");
    expect(resolvePaletteId("neon")).toBe("observable");
  });

  it("passes through ids that are not aliases", () => {
    expect(resolvePaletteId("citrine")).toBe("citrine");
    expect(resolvePaletteId("tableau")).toBe("tableau");
    expect(resolvePaletteId("does-not-exist")).toBe("does-not-exist");
  });
});

describe("ColorPalette type structure", () => {
  it("satisfies the ColorPalette interface shape", () => {
    const palette: ColorPalette = { label: "Test", colors: ["#fff"] };
    expect(palette.label).toBe("Test");
    expect(palette.colors).toHaveLength(1);
  });
});
