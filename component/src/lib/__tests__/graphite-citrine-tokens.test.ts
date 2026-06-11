import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Contract tests for the Graphite & Citrine design tokens (#820, #823).
 * Parses design-tokens.css so drift from the locked palette decisions is
 * caught at unit-test time, not in a visual review.
 */

const css = readFileSync(
  resolve(__dirname, "../../../design-tokens.css"),
  "utf8",
);

function block(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `${selector} block exists`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function tokenValue(blockCss: string, token: string): string | undefined {
  const m = blockCss.match(new RegExp(`${token}:\\s*([^;]+);`));
  return m?.[1].trim();
}

const light = block(":root");
const dark = block(".dark");

describe("Graphite & Citrine locked palette values (#820)", () => {
  it("light background is the locked cool off-white", () => {
    expect(tokenValue(light, "--background")).toBe("220 14% 98%");
  });

  it("dark background is the locked dense charcoal", () => {
    expect(tokenValue(dark, "--background")).toBe("220 13% 8%");
  });

  it("primary is the locked near-black graphite (light mode)", () => {
    expect(tokenValue(light, "--primary")).toBe("220 13% 9%");
  });

  it("focus ring is the citrine amber accent in both modes", () => {
    expect(tokenValue(light, "--ring")).toBe("38 95% 55%");
    expect(tokenValue(dark, "--ring")).toBe("38 95% 55%");
  });
});

describe("new token surface (#820)", () => {
  const required = ["--surface", "--surface-2", "--border-strong"];

  it.each(required)("%s is defined in both modes", (token) => {
    expect(tokenValue(light, token), `${token} light`).toBeTruthy();
    expect(tokenValue(dark, token), `${token} dark`).toBeTruthy();
  });

  it("--accent-soft is a low-alpha citrine tint in both modes", () => {
    for (const mode of [light, dark]) {
      const v = tokenValue(mode, "--accent-soft");
      expect(v).toMatch(/^hsl\(38 95% 55% \/ 0\.1\d?\)$/);
    }
  });

  it("dark surfaces step progressively lighter than the background", () => {
    const lightness = (v: string | undefined) =>
      Number(v?.match(/(\d+(?:\.\d+)?)%$/)?.[1]);
    const bg = lightness(tokenValue(dark, "--background"));
    const s1 = lightness(tokenValue(dark, "--surface"));
    const s2 = lightness(tokenValue(dark, "--surface-2"));
    expect(s1).toBeGreaterThan(bg);
    expect(s2).toBeGreaterThan(s1);
  });
});

describe("elevation scale (#823)", () => {
  it.each(["--shadow-sm", "--shadow-md", "--shadow-lg"])(
    "%s is defined in both modes",
    (token) => {
      expect(tokenValue(light, token), `${token} light`).toBeTruthy();
      expect(tokenValue(dark, token), `${token} dark`).toBeTruthy();
    },
  );

  it("light-mode shadows are warm-tinted, not pure black", () => {
    for (const token of ["--shadow-sm", "--shadow-md", "--shadow-lg"]) {
      const v = tokenValue(light, token)!;
      expect(v).not.toMatch(/rgba?\(0,\s*0,\s*0/);
      expect(v).toMatch(/hsl\(3\d/); // warm hue family
    }
  });
});

describe("typography tokens (#830)", () => {
  it("defines display and body font custom properties", () => {
    expect(tokenValue(light, "--font-display")).toMatch(/^"Geist Sans"/);
    expect(tokenValue(light, "--font-body")).toMatch(/^"Inter"/);
    expect(tokenValue(light, "--font-display")).toMatch(/system-ui/);
  });

  it("self-hosts both variable fonts via @font-face", () => {
    expect(css).toMatch(
      /@font-face[\s\S]*?Geist Sans[\s\S]*?geist-sans-variable\.woff2/,
    );
    expect(css).toMatch(/@font-face[\s\S]*?Inter[\s\S]*?inter-variable\.woff2/);
    // variable fonts: full weight range, graceful fallback
    expect(css).toMatch(/font-weight:\s*100 900/);
    expect(css).toMatch(/font-display:\s*swap/);
  });
});

describe("radius scale (#831)", () => {
  it.each([
    ["--radius-sm", "0.375rem"],
    ["--radius-md", "0.5rem"],
    ["--radius-lg", "0.75rem"],
    ["--radius-pill", "9999px"],
  ])("%s = %s", (token, value) => {
    expect(tokenValue(light, token)).toBe(value);
  });

  it("keeps --radius as a backward-compatible alias of --radius-md", () => {
    expect(tokenValue(light, "--radius")).toBe("var(--radius-md)");
  });
});

describe("motion tokens (#833)", () => {
  it.each([
    ["--ease-standard", "cubic-bezier(0.2, 0, 0, 1)"],
    ["--ease-emphasized", "cubic-bezier(0.3, 0, 0, 1)"],
    ["--duration-fast", "150ms"],
    ["--duration-normal", "200ms"],
    ["--duration-slow", "300ms"],
  ])("%s = %s", (token, value) => {
    expect(tokenValue(light, token)).toBe(value);
  });
});
