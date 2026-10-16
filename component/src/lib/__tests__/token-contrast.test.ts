import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * WCAG 2.x contrast of the ruled-sheet palette (#2215). Reads the channels
 * out of design-tokens.css and computes the ratios, so a token edit that
 * drops text under 4.5:1 or a control edge under 3:1 (1.4.11) fails here
 * instead of in a visual review.
 */
const css = readFileSync(
  resolve(__dirname, "../../../design-tokens.css"),
  "utf8",
);

function block(selector: string): string {
  const open = css.indexOf("{", css.indexOf(selector));
  return css.slice(open + 1, css.indexOf("}", open));
}

function channels(blockCss: string, token: string): [number, number, number] {
  const m = blockCss.match(new RegExp(`${token}:\\s*(\\d+) (\\d+)% (\\d+)%;`));
  expect(m, `${token} is bare H S% L% channels`).not.toBeNull();
  return [Number(m![1]), Number(m![2]), Number(m![3])];
}

function luminance([h, s, l]: [number, number, number]): number {
  const S = s / 100;
  const L = l / 100;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(0) + 0.7152 * f(8) + 0.0722 * f(4);
}

function ratio(blockCss: string, fg: string, bg: string): number {
  const x = luminance(channels(blockCss, fg));
  const y = luminance(channels(blockCss, bg));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe.each([
  ["light", block(":root")],
  ["dark", block(".dark")],
])("%s theme contrast (#2215)", (_theme, tokens) => {
  it.each([
    ["--foreground", "--background"],
    ["--foreground", "--side"],
    ["--foreground-2", "--background"],
    ["--foreground-2", "--side"],
    ["--muted-foreground", "--background"],
    ["--muted-foreground", "--side"],
  ])("%s on %s reaches 4.5:1", (fg, bg) => {
    expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([["--ring"], ["--input"]])(
    "%s on the page reaches 3:1 (WCAG 1.4.11)",
    (fg) => {
      expect(ratio(tokens, fg, "--background")).toBeGreaterThanOrEqual(3);
    },
  );
});
