import { describe, it, expect } from "vitest";
import { fadeToTransparent } from "../chart-utils";

/**
 * Area-fill gradients must fade to the SAME colour at zero alpha (#1244).
 *
 * The previous gradient faded to `rgba(255,255,255,0)`. Canvas interpolates
 * gradients in non-premultiplied RGBA, so fading a saturated colour to
 * transparent *white* washes through pale grey on the way down — one of the
 * two reasons the dark-mode area fill looked muddy.
 */
describe("fadeToTransparent", () => {
  it("keeps hsl colours in-hue at zero alpha", () => {
    expect(fadeToTransparent("hsl(38, 95%, 55%)")).toBe(
      "hsla(38, 95%, 55%, 0)",
    );
  });

  it("keeps rgb colours in-hue at zero alpha", () => {
    expect(fadeToTransparent("rgb(249, 169, 31)")).toBe(
      "rgba(249, 169, 31, 0)",
    );
  });

  it("keeps 6-digit hex colours in-hue at zero alpha", () => {
    expect(fadeToTransparent("#f9a91f")).toBe("#f9a91f00");
  });

  it("expands 3-digit hex before appending the alpha channel", () => {
    // #f9a00 would be a malformed 5-digit value, so the shorthand has to be
    // expanded first rather than naively suffixed.
    expect(fadeToTransparent("#f9a")).toBe("#ff99aa00");
  });

  it("passes through a colour that is already fully transparent", () => {
    expect(fadeToTransparent("hsla(38, 95%, 55%, 0)")).toBe(
      "hsla(38, 95%, 55%, 0)",
    );
  });

  it("never returns white for an unrecognised format", () => {
    // Falling back to white would reintroduce the exact bug this fixes.
    const out = fadeToTransparent("var(--chart-1)");
    expect(out).not.toMatch(/255,\s*255,\s*255/);
    expect(out).toMatch(/0\s*\)$/);
  });
});
