import { describe, it, expect } from "vitest";
import {
  contrastTextColor,
  contrastRatio,
  labelColorOn,
  legibleFill,
  mixColors,
  LABEL_INK,
} from "../chart-utils";
import {
  CITRINE_LIGHT,
  CITRINE_DARK,
  HASTINGS_LIGHT,
  HASTINGS_DARK,
  SURFACE_COLOR,
} from "../theme";

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

  it("rejects a long malformed hsl() in linear time (#2101)", () => {
    // CPU time, not wall clock (#1993): the old regex backtracked cubically.
    const start = process.cpuUsage();
    expect(contrastTextColor(`hsl(${" ".repeat(5000)}!`)).toBe("#000000");
    const { user, system } = process.cpuUsage(start);
    expect((user + system) / 1000).toBeLessThan(250);
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

describe("labelColorOn", () => {
  it("never puts white on the dark-theme citrine (about 2:1)", () => {
    expect(contrastRatio("#F2A93B", "#FFFFFF")).toBeLessThan(2.5);
    expect(labelColorOn("#F2A93B")).toBe(LABEL_INK);
  });

  it("takes white on a dark fill and ink on a light one", () => {
    expect(labelColorOn("#1B2A4A")).toBe("#FFFFFF");
    expect(labelColorOn("#F6F7F9")).toBe(LABEL_INK);
  });

  // The rule is "whichever contrasts more", and the owner set the bar at 4.5:1.
  // This walks every fill the sunburst can paint: each palette hue, mixed
  // toward the card the way the chart steps its children.
  it.each([
    ["light", HASTINGS_LIGHT, SURFACE_COLOR.light],
    ["dark", HASTINGS_DARK, SURFACE_COLOR.dark],
  ])("reaches 4.5:1 on every %s sunburst fill", (_name, palette, card) => {
    for (const base of palette) {
      for (const t of [0, 0.3, 0.48, 0.66, 0.6, 0.7]) {
        const fill = legibleFill(mixColors(base, card, t), card);
        expect(contrastRatio(fill, labelColorOn(fill))).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });
});

describe("legibleFill", () => {
  it("moves a mid-tone fill off the dead zone, and leaves a good one alone", () => {
    // Neither ink nor white reaches 4.5:1 on this grey.
    const grey = "#777777";
    expect(contrastRatio(grey, labelColorOn(grey))).toBeLessThan(4.5);
    const moved = legibleFill(grey, "#FFFFFF");
    expect(contrastRatio(moved, labelColorOn(moved))).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(legibleFill("#1B2A4A", "#FFFFFF")).toBe("#1B2A4A");
  });
});

describe("mixColors", () => {
  it("returns the first colour at 0 and the second at 1", () => {
    expect(mixColors("#102030", "#FFFFFF", 0)).toBe("#102030");
    expect(mixColors("#102030", "#FFFFFF", 1)).toBe("#ffffff");
  });

  it("mixes halfway and accepts hsl()", () => {
    expect(mixColors("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixColors("hsl(0, 0%, 0%)", "#ffffff", 0.5)).toBe("#808080");
  });
});
