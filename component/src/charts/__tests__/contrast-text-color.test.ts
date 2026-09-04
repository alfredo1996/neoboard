import { describe, it, expect } from "vitest";
import { contrastTextColor } from "../chart-utils";
import { CITRINE_LIGHT, CITRINE_DARK } from "../theme";

describe("contrastTextColor", () => {
  it("returns white text on a dark background", () => {
    expect(contrastTextColor("#000000")).toBe("#ffffff");
    expect(contrastTextColor("#222222")).toBe("#ffffff");
    expect(contrastTextColor("#0000ff")).toBe("#ffffff");
  });

  it("returns black text on a light background", () => {
    expect(contrastTextColor("#ffffff")).toBe("#000000");
    expect(contrastTextColor("#eeeeee")).toBe("#000000");
    expect(contrastTextColor("#ffff00")).toBe("#000000");
  });

  it("accepts shorthand #rgb hex", () => {
    expect(contrastTextColor("#000")).toBe("#ffffff");
    expect(contrastTextColor("#fff")).toBe("#000000");
    expect(contrastTextColor("#0f0")).toBe("#000000");
  });

  it("accepts uppercase hex", () => {
    expect(contrastTextColor("#FFFFFF")).toBe("#000000");
    expect(contrastTextColor("#AABBCC")).toBe("#000000");
  });

  it("parses rgb() and rgba() color strings", () => {
    expect(contrastTextColor("rgb(0, 0, 0)")).toBe("#ffffff");
    expect(contrastTextColor("rgb(255, 255, 255)")).toBe("#000000");
    expect(contrastTextColor("rgba(10, 10, 10, 0.5)")).toBe("#ffffff");
  });

  it("parses percentage components in rgb()", () => {
    expect(contrastTextColor("rgb(0%, 0%, 0%)")).toBe("#ffffff");
    expect(contrastTextColor("rgb(100%, 100%, 100%)")).toBe("#000000");
  });

  it("parses hsl() and hsla() color strings", () => {
    // The shipped palettes are hsl() strings, so this is the form that reaches
    // every label on a chart or a styling rule (#1295). Before this branch
    // existed they all parsed to null and got black — invisible on the dark
    // half of the palette.
    expect(contrastTextColor("hsl(265, 55%, 48%)")).toBe("#ffffff"); // violet
    expect(contrastTextColor("hsl(350, 70%, 48%)")).toBe("#ffffff"); // rose
    expect(contrastTextColor("hsl(38, 95%, 55%)")).toBe("#000000"); // amber
    expect(contrastTextColor("hsl(0, 100%, 50%)")).toBe("#000000"); // pure red
    expect(contrastTextColor("hsla(330, 65%, 38%, 0.9)")).toBe("#ffffff");
  });

  it("accepts space-separated and slash-alpha hsl forms", () => {
    expect(contrastTextColor("hsl(265 55% 48%)")).toBe("#ffffff");
    expect(contrastTextColor("hsl(265 55% 48% / 0.5)")).toBe("#ffffff");
    expect(contrastTextColor("hsl(38deg 95% 55%)")).toBe("#000000");
  });

  it("picks a readable label colour for every citrine swatch", () => {
    // Whole-palette table: a regression here means some series label goes
    // unreadable, which is exactly how #1295 shipped.
    const light = CITRINE_LIGHT.map(contrastTextColor);
    const dark = CITRINE_DARK.map(contrastTextColor);
    const W = "#ffffff";
    const B = "#000000";
    expect(light).toEqual([B, B, W, W, B, W, B, B, B, B]);
    expect(dark).toEqual([B, B, W, B, B, W, B, B, B, B]);
  });

  it("falls back to black for unparseable inputs instead of producing invisible text", () => {
    // Previously these would crash or silently parse to NaN and emit white
    // text — invisible on light backgrounds set by the same styling rule.
    expect(contrastTextColor("red")).toBe("#000000");
    expect(contrastTextColor("var(--accent)")).toBe("#000000");
    expect(contrastTextColor("")).toBe("#000000");
    expect(contrastTextColor("garbage")).toBe("#000000");
  });

  it("rejects malformed hsl() inputs", () => {
    expect(contrastTextColor("hsl(265, 55%)")).toBe("#000000");
    expect(contrastTextColor("hsl(a, b%, c%)")).toBe("#000000");
    expect(contrastTextColor("hsl(265, 55, 48)")).toBe("#000000");
  });

  it("rejects malformed hex strings", () => {
    expect(contrastTextColor("#12")).toBe("#000000");
    expect(contrastTextColor("#12345")).toBe("#000000");
    expect(contrastTextColor("#1234567")).toBe("#000000");
    expect(contrastTextColor("#zzz")).toBe("#000000");
  });

  it("rejects malformed rgb() inputs", () => {
    expect(contrastTextColor("rgb(0, 0)")).toBe("#000000");
    expect(contrastTextColor("rgb(a, b, c)")).toBe("#000000");
  });

  it("rejects rgb()/rgba() with wrong arity (extra channels are not silently dropped)", () => {
    // Previously rgb(1,2,3,4,5) parsed the first 3 channels and ignored the
    // rest, accepting clearly malformed input.
    expect(contrastTextColor("rgb(1, 2, 3, 4)")).toBe("#000000");
    expect(contrastTextColor("rgb(1, 2, 3, 4, 5)")).toBe("#000000");
    expect(contrastTextColor("rgba(1, 2, 3)")).toBe("#000000");
    expect(contrastTextColor("rgba(1, 2, 3, 0.5, 9)")).toBe("#000000");
  });

  it("rejects rgba() with alpha outside [0, 1]", () => {
    expect(contrastTextColor("rgba(0, 0, 0, 2)")).toBe("#000000");
    expect(contrastTextColor("rgba(0, 0, 0, -0.1)")).toBe("#000000");
    expect(contrastTextColor("rgba(0, 0, 0, foo)")).toBe("#000000");
  });

  it("accepts valid rgba() with in-range alpha", () => {
    // Sanity: the stricter validator must not regress valid inputs.
    expect(contrastTextColor("rgba(0, 0, 0, 0)")).toBe("#ffffff");
    expect(contrastTextColor("rgba(255, 255, 255, 1)")).toBe("#000000");
  });
});
