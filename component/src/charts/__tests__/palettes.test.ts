import { describe, it, expect } from "vitest";
import {
  COLOR_PALETTES,
  getPaletteColors,
  type ColorPalette,
} from "../palettes";

describe("COLOR_PALETTES", () => {
  it("contains at least 5 predefined palettes", () => {
    expect(Object.keys(COLOR_PALETTES).length).toBeGreaterThanOrEqual(5);
  });

  it("contains 'deep-ocean' as the default palette", () => {
    expect(COLOR_PALETTES["deep-ocean"]).toBeDefined();
  });

  it("every palette has a label string", () => {
    for (const [, palette] of Object.entries(COLOR_PALETTES)) {
      expect(typeof palette.label).toBe("string");
      expect(palette.label.length).toBeGreaterThan(0);
    }
  });

  it("every palette has exactly 10 colors", () => {
    for (const [id, palette] of Object.entries(COLOR_PALETTES)) {
      expect(palette.colors, `palette "${id}" should have 10 colors`).toHaveLength(10);
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

  it("'deep-ocean' palette label contains 'Default'", () => {
    expect(COLOR_PALETTES["deep-ocean"].label).toContain("Default");
  });

  it("contains 'warm-sunset' palette", () => {
    expect(COLOR_PALETTES["warm-sunset"]).toBeDefined();
  });

  it("contains 'cool-breeze' palette", () => {
    expect(COLOR_PALETTES["cool-breeze"]).toBeDefined();
  });

  it("contains 'earth-tones' palette", () => {
    expect(COLOR_PALETTES["earth-tones"]).toBeDefined();
  });

  it("contains 'neon' palette", () => {
    expect(COLOR_PALETTES["neon"]).toBeDefined();
  });

  it("contains 'monochrome' palette", () => {
    expect(COLOR_PALETTES["monochrome"]).toBeDefined();
  });

  it("deep-ocean colors match DEEP_OCEAN_LIGHT from theme", () => {
    // The deep-ocean palette should reuse the existing DEEP_OCEAN_LIGHT values
    const deepOcean = COLOR_PALETTES["deep-ocean"];
    expect(deepOcean.colors[0]).toBe("hsl(217, 91%, 60%)"); // Blue
    expect(deepOcean.colors[1]).toBe("hsl(38, 92%, 50%)");  // Amber
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
      expect(colors, `getPaletteColors("${id}") should return colors`).toBeDefined();
      expect(colors!.length).toBe(10);
    }
  });

  it("returns undefined for an unknown palette id", () => {
    expect(getPaletteColors("does-not-exist")).toBeUndefined();
  });

  it("returns the same reference as COLOR_PALETTES[id].colors", () => {
    const colors = getPaletteColors("warm-sunset");
    expect(colors).toBe(COLOR_PALETTES["warm-sunset"].colors);
  });
});

describe("ColorPalette type structure", () => {
  it("satisfies the ColorPalette interface shape", () => {
    // This is a compile-time check validated at runtime
    const palette: ColorPalette = { label: "Test", colors: ["#fff"] };
    expect(palette.label).toBe("Test");
    expect(palette.colors).toHaveLength(1);
  });
});
