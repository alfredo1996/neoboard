import { describe, it, expect } from "vitest";
import { interpolateColor } from "../styling-rule";

describe("interpolateColor", () => {
  it("returns minColor at min value", () => {
    expect(interpolateColor(0, 0, 100, "#ff0000", "#00ff00")).toBe("#ff0000");
  });

  it("returns maxColor at max value", () => {
    expect(interpolateColor(100, 0, 100, "#ff0000", "#00ff00")).toBe("#00ff00");
  });

  it("returns midpoint color at 50%", () => {
    // #ff0000 (255,0,0) to #00ff00 (0,255,0) at 50% = (128,128,0) = #808000
    const result = interpolateColor(50, 0, 100, "#ff0000", "#00ff00");
    expect(result).toBe("#808000");
  });

  it("clamps below min to minColor", () => {
    expect(interpolateColor(-10, 0, 100, "#ff0000", "#00ff00")).toBe("#ff0000");
  });

  it("clamps above max to maxColor", () => {
    expect(interpolateColor(200, 0, 100, "#ff0000", "#00ff00")).toBe("#00ff00");
  });

  it("handles min === max by returning minColor", () => {
    expect(interpolateColor(50, 50, 50, "#ff0000", "#00ff00")).toBe("#ff0000");
  });

  it("works with 3-char hex shorthand", () => {
    // #f00 → #ff0000, #0f0 → #00ff00
    expect(interpolateColor(0, 0, 100, "#f00", "#0f0")).toBe("#ff0000");
    expect(interpolateColor(100, 0, 100, "#f00", "#0f0")).toBe("#00ff00");
  });

  it("returns correct color at 25%", () => {
    // #000000 to #ffffff at 25% → each channel = 64 = 0x40
    expect(interpolateColor(25, 0, 100, "#000000", "#ffffff")).toBe("#404040");
  });
});
