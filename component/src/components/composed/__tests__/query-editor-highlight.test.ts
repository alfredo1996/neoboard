import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  darkHighlightStyle,
  lightHighlightStyle,
} from "../query-editor-highlight";

// Independent WCAG 2.x contrast, from the stylesheet's own --field token.
const css = readFileSync(
  resolve(__dirname, "../../../../design-tokens.css"),
  "utf8",
);
const fieldIn = (block: RegExp) => {
  const m = block
    .exec(css)?.[0]
    .match(/--field:\s*([\d.]+) ([\d.]+)% ([\d.]+)%/);
  if (!m) throw new Error("--field token not found");
  return hslToRgb(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100);
};
function hslToRgb(h: number, s: number, l: number): number[] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)].map((v) => v * 255);
}
const hexToRgb = (hex: string) => {
  const h = hex.slice(1);
  const full = h.length === 3 ? [...h].map((d) => d + d).join("") : h;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
};
const lum = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const colours = (style: { specs: readonly object[] }) => [
  ...new Set(
    style.specs
      .map((s) => (s as { color?: unknown }).color)
      .filter((c) => typeof c === "string"),
  ),
];

describe("query editor syntax colours reach WCAG AA on the field (#2329)", () => {
  const cases = [
    ["light", lightHighlightStyle, fieldIn(/:root\s*{[^}]*?--field[^}]*}/s)],
    ["dark", darkHighlightStyle, fieldIn(/\n\.dark\s*{[^}]*?--field[^}]*}/s)],
  ] as const;
  it.each(cases)("%s: every colour is at least 4.5:1", (_n, style, field) => {
    const low = colours(style).filter(
      (c) => c.startsWith("#") && contrast(hexToRgb(c), field) < 4.5,
    );
    expect(low).toEqual([]);
  });
});
