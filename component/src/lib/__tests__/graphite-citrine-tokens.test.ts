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

  it("focus/selection ring is azure (#1553: interaction moved off citrine)", () => {
    // Hue 212, chosen from a six-hue comparison as the only blue that clears
    // 5:1 for the ring on BOTH grounds (5.38 light / 6.22 dark). Bluer hues are
    // inherently darker, so every other blue trades one theme for the other.
    expect(tokenValue(light, "--ring")).toBe("212 90% 42%");
    expect(tokenValue(dark, "--ring")).toBe("212 90% 62%");
  });

  it("--accent and --ring share a hue in both modes (they move together)", () => {
    // --ring owns the focus ring, tab underline, sidebar rail and input focus
    // border; --accent owns the hover/selected fill. Moving one without the
    // other yields a blue menu highlight framed by an amber focus ring.
    const hue = (v: string | undefined) => Number(v?.match(/^(\d+)/)?.[1]);
    expect(hue(tokenValue(light, "--accent"))).toBe(
      hue(tokenValue(light, "--ring")),
    );
    expect(hue(tokenValue(dark, "--accent"))).toBe(
      hue(tokenValue(dark, "--ring")),
    );
  });

  it("interaction hue is not the brand hue (#1553 keeps citrine for brand + charts)", () => {
    const hue = (v: string | undefined) => Number(v?.match(/^(\d+)/)?.[1]);
    expect(hue(tokenValue(light, "--ring"))).not.toBe(
      hue(tokenValue(light, "--brand")),
    );
  });

  it("--warning stays a distinct hue from the ring (no warning/interactive collision)", () => {
    const hue = (v: string | undefined) => Number(v?.match(/^(\d+)/)?.[1]);
    expect(hue(tokenValue(light, "--warning"))).not.toBe(
      hue(tokenValue(light, "--ring")),
    );
    expect(hue(tokenValue(dark, "--warning"))).not.toBe(
      hue(tokenValue(dark, "--ring")),
    );
  });

  it("brand mark stays the citrine amber in both modes", () => {
    expect(tokenValue(light, "--brand")).toBe("38 95% 55%");
    expect(tokenValue(dark, "--brand")).toBe("38 95% 58%");
  });

  it("chart-1 data color stays citrine (charts keep the warm palette)", () => {
    expect(tokenValue(light, "--chart-1")).toBe("38 95% 55%");
  });
});

describe("new token surface (#820)", () => {
  const required = ["--surface", "--surface-2", "--border-strong"];

  it.each(required)("%s is defined in both modes", (token) => {
    expect(tokenValue(light, token), `${token} light`).toBeTruthy();
    expect(tokenValue(dark, token), `${token} dark`).toBeTruthy();
  });

  it("--accent-soft is a low-alpha azure tint in light mode", () => {
    // Same hue as --ring so hover fills and the active rail read as one
    // family; alpha-based so it composites on any light surface.
    expect(tokenValue(light, "--accent-soft")).toMatch(
      /^hsl\(212 \d{2}% \d{2}% \/ 0\.\d+\)$/,
    );
  });

  it("--accent-soft is neutral in dark mode (#1244)", () => {
    // A warm hue at low alpha over a near-black surface composites to brown,
    // not to subtle amber — selection looked like a dull smear. Dark selection
    // is expressed as neutral elevation instead; the citrine signal is carried
    // at full strength by the active item's left rail (--ring).
    const v = tokenValue(dark, "--accent-soft");
    const saturation = Number(v?.match(/^hsl\(\d+ (\d+)%/)?.[1]);
    expect(
      saturation,
      `dark --accent-soft must be neutral, got ${v}`,
    ).toBeLessThanOrEqual(10);
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

  it("the warm-hue matcher rejects a cold hue", () => {
    // Positive/negative control for the pattern itself: without the trailing
    // delimiter it accepted hsl(300 ...) as "warm".
    const WARM = /hsl\(3\d[\s,)]/;
    expect(WARM.test("0 1px 2px hsl(38 40% 12% / 0.06)")).toBe(true);
    expect(WARM.test("0 1px 2px hsl(300 40% 12% / 0.06)")).toBe(false);
    expect(WARM.test("0 1px 2px hsl(220 40% 12% / 0.06)")).toBe(false);
  });

  it("light-mode shadows are warm-tinted, not pure black", () => {
    for (const token of ["--shadow-sm", "--shadow-md", "--shadow-lg"]) {
      const v = tokenValue(light, token)!;
      expect(v).not.toMatch(/rgba?\(0,\s*0,\s*0/);
      // Anchored to a hue delimiter: /hsl\(3\d/ also matched hue 300 —
      // magenta — because there was no digit boundary (#1632).
      expect(v).toMatch(/hsl\(3\d[\s,)]/); // warm hue family, 30-39
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

describe("single error red (Epic B #1126)", () => {
  it("--danger is gone — --destructive is the only error red", () => {
    expect(css).not.toContain("--danger");
  });

  it("--destructive is the deeper AA red (light) / lifted text-safe red (dark)", () => {
    expect(tokenValue(light, "--destructive")).toBe("0 72% 45%");
    expect(tokenValue(dark, "--destructive")).toBe("0 80% 68%");
  });

  it("dark destructive foreground is near-black (light-red surface needs dark text)", () => {
    expect(tokenValue(light, "--destructive-foreground")).toBe("0 0% 98%");
    expect(tokenValue(dark, "--destructive-foreground")).toBe("220 13% 9%");
  });
});

// ─── WCAG contrast ratchet (#1505) ───────────────────────────────────────
// The Storybook a11y gate measures light mode only; this pins every semantic
// text/tint/solid pair in BOTH themes at AA (4.5:1), from the token file.

function hsl(value: string | undefined): [number, number, number] {
  const m = value?.match(
    /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/,
  );
  if (!m) throw new Error(`not an H S% L% token: ${value}`);
  const h = Number(m[1]) / 360,
    sat = Number(m[2]) / 100,
    l = Number(m[3]) / 100;
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat,
    p = 2 * l - q;
  const ch = (tc: number) => {
    if (tc < 0) tc += 1;
    if (tc > 1) tc -= 1;
    if (tc < 1 / 6) return p + (q - p) * 6 * tc;
    if (tc < 1 / 2) return q;
    if (tc < 2 / 3) return p + (q - p) * (2 / 3 - tc) * 6;
    return p;
  };
  return sat === 0 ? [l, l, l] : [ch(h + 1 / 3), ch(h), ch(h - 1 / 3)];
}
const lum = (c: [number, number, number]) =>
  c
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const over = (
  fg: [number, number, number],
  alpha: number,
  bg: [number, number, number],
) =>
  fg.map((v, i) => v * alpha + bg[i] * (1 - alpha)) as [number, number, number];

describe("semantic colours meet WCAG AA in both themes (#1505)", () => {
  const AA = 4.5;
  for (const [theme, b] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    const tok = (n: string) => hsl(tokenValue(b, n));
    const page = tok("--background"),
      card = tok("--card"),
      accent = tok("--accent");
    for (const [name, tint] of [
      ["--success", 0.15],
      ["--warning", 0.15],
      ["--destructive", 0.1],
    ] as const) {
      const fg = tok(name),
        solidText = tok(`${name}-foreground`);
      it(`${theme} ${name} text on the page background`, () => {
        expect(contrast(fg, page)).toBeGreaterThanOrEqual(AA);
      });
      it(`${theme} ${name} text on its own ${tint * 100}% tint (badge/alert)`, () => {
        // the tint sits over whichever ground the badge lands on; take the worse
        expect(
          Math.min(
            contrast(fg, over(fg, tint, card)),
            contrast(fg, over(fg, tint, page)),
          ),
        ).toBeGreaterThanOrEqual(AA);
      });
      it(`${theme} ${name}-foreground on the solid fill (button)`, () => {
        expect(contrast(solidText, fg)).toBeGreaterThanOrEqual(AA);
      });
    }
    it(`${theme} --muted-foreground on the page and on the accent tint`, () => {
      const mf = tok("--muted-foreground");
      expect(contrast(mf, page)).toBeGreaterThanOrEqual(AA);
      expect(contrast(mf, accent)).toBeGreaterThanOrEqual(AA);
    });
  }
});
