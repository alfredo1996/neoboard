import { describe, it, expect } from "vitest";
import { toNvlColor } from "../nvl-color";

/**
 * NVL renders nodes to WebGL and only understands hex (not CSS `hsl()`).
 * The brand citrine palette is defined in `hsl()`, so node label colors must
 * be converted to hex before reaching NVL — otherwise nodes get no fill and
 * render invisibly (#1157).
 */
describe("toNvlColor", () => {
  it("converts hsl() primaries to exact hex", () => {
    expect(toNvlColor("hsl(0, 100%, 50%)")).toBe("#ff0000");
    expect(toNvlColor("hsl(120, 100%, 50%)")).toBe("#00ff00");
    expect(toNvlColor("hsl(240, 100%, 50%)")).toBe("#0000ff");
  });

  it("converts black and white", () => {
    expect(toNvlColor("hsl(0, 0%, 0%)")).toBe("#000000");
    expect(toNvlColor("hsl(0, 0%, 100%)")).toBe("#ffffff");
  });

  it("converts the citrine palette to valid 6-digit hex (never hsl)", () => {
    for (const c of [
      "hsl(38, 95%, 55%)",
      "hsl(185, 70%, 48%)",
      "hsl(265, 55%, 48%)",
    ]) {
      const out = toNvlColor(c);
      expect(out).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("tolerates whitespace variations in the hsl string", () => {
    expect(toNvlColor("hsl(0,100%,50%)")).toBe("#ff0000");
    expect(toNvlColor("hsl( 0 , 100% , 50% )")).toBe("#ff0000");
  });

  it("passes hex colors through unchanged (NVL already handles them)", () => {
    expect(toNvlColor("#4E79A7")).toBe("#4E79A7");
    expect(toNvlColor("#fff")).toBe("#fff");
  });

  it("passes non-hsl / unparseable values through unchanged", () => {
    expect(toNvlColor("rebeccapurple")).toBe("rebeccapurple");
    expect(toNvlColor("")).toBe("");
  });
});
