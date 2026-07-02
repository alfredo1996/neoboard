import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Epic D (#1128) D1 — lock tonal AA contrast in both themes.
 * The tonal surface is --ring at 14% alpha composited over --background;
 * its label is --accent-foreground. Assert WCAG AA (>=4.5:1) by computing
 * the real composited color, so token drift can't silently break contrast.
 */

const css = readFileSync(
  resolve(__dirname, "../../../design-tokens.css"),
  "utf8",
);

function block(selector: string): string {
  const start = css.indexOf(selector);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

function hslToken(blockCss: string, token: string): [number, number, number] {
  const m = blockCss.match(new RegExp(`${token}:\\s*([^;]+);`));
  const [h, s, l] = m![1].trim().split(/\s+/);
  return [parseFloat(h), parseFloat(s) / 100, parseFloat(l) / 100];
}

function hslToRgb([h, s, l]: [number, number, number]): number[] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Composite fg over bg at the given alpha (per channel, sRGB space). */
function composite(fg: number[], bg: number[], alpha: number): number[] {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
}

const TONAL_ALPHA = 0.14;

it.each([":root", ".dark"])(
  "tonal label text meets WCAG AA (4.5:1) in %s",
  (theme) => {
    const b = block(theme);
    const fill = composite(
      hslToRgb(hslToken(b, "--ring")),
      hslToRgb(hslToken(b, "--background")),
      TONAL_ALPHA,
    );
    const text = hslToRgb(hslToken(b, "--accent-foreground"));
    expect(contrast(text, fill)).toBeGreaterThanOrEqual(4.5);
  },
);
