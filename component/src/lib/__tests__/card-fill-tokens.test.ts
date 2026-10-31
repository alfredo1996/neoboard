import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Card background presets (#2394). `[data-card-fill]` redefines --card (and
 * --input for the fields on it); every ink must still read on each tint and on
 * None (the page ground), and a field edge must hold 3:1 against the card.
 */
const css = readFileSync(
  resolve(__dirname, "../../../design-tokens.css"),
  "utf8",
);

type Scope = Record<string, string>;

/** Every top-level rule with this exact selector, declarations merged. */
function scope(selector: string): Scope {
  const escaped = selector.replaceAll(/[.[\]"=]/g, String.raw`\$&`);
  const out: Scope = {};
  for (const m of css.matchAll(new RegExp(`^${escaped} \\{([^}]*)\\}`, "gm"))) {
    for (const d of m[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
      out[d[1]] = d[2].trim();
    }
  }
  return out;
}

function hslToRgb(h: number, s: number, l: number): number[] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}
const lum = (rgb: number[]) => {
  const [r, g, b] = rgb.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** A token as RGB: the fill's own rule first, then the theme; var() chains follow the theme. */
function rgbOf(name: string, theme: Scope, fill: Scope = {}): number[] {
  const v = fill[name] ?? theme[name];
  expect(v, `${name} is declared`).toBeDefined();
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) return rgbOf(ref[1], theme, fill);
  const [h, s, l] = v.split(/\s+/);
  return hslToRgb(parseFloat(h), parseFloat(s) / 100, parseFloat(l) / 100);
}

const FILLS = ["azure", "citrine", "sage", "rose", "none"];
const INKS = [
  "--foreground",
  "--foreground-2",
  "--muted-foreground",
  "--destructive",
];
const light = scope(":root");
const dark = { ...light, ...scope(".dark") };

describe.each([
  ["light", light],
  ["dark", dark],
] as const)("card fills in %s (#2394)", (_theme, theme) => {
  describe.each(FILLS)("%s", (name) => {
    const fill = {
      ...scope("[data-card-fill]"),
      ...scope(`[data-card-fill="${name}"]`),
    };
    const card = rgbOf("--card", theme, fill);
    it.each(INKS)("%s reads at 4.5:1", (ink) => {
      expect(contrast(rgbOf(ink, theme), card)).toBeGreaterThanOrEqual(4.5);
    });
    it("the field edge holds 3:1 against the card", () => {
      expect(
        contrast(rgbOf("--input", theme, fill), card),
      ).toBeGreaterThanOrEqual(3);
    });
    it("a field stays the plain card colour", () => {
      expect(fill["--field"]).toBe("var(--card-plain)");
    });
  });
});

describe("card-fill token values (#2394)", () => {
  it("the dark Citrine and Rose card fills are muted from the field colours", () => {
    expect(scope(".dark")["--card-fill-citrine"]).toBe("38 22% 15.5%");
    expect(scope(".dark")["--card-fill-rose"]).toBe("350 16% 16%");
  });
  it("None sits on the page ground with no edge or shadow", () => {
    const none = scope('[data-card-fill="none"]');
    expect(none["--card"]).toBe("var(--page-ground)");
    expect(none["--card-edge"]).toBe("var(--page-ground)");
    expect(none["--card-shadow"]).toBe("none");
  });
});
