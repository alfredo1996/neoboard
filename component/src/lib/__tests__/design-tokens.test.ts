import { describe, it, expect } from "vitest";
import { jsonSyntaxColors, successTextColor } from "../design-tokens";

describe("design-tokens", () => {
  // ── raw-palette ratchet (#1249) ──────────────────────────────────────────
  //
  // No raw Tailwind palette shades in exported token maps, so theming and dark
  // mode keep working from one source. jsonSyntaxColors was the one exception
  // until the viewer moved onto the --code-* tokens (#2232).
  const RAW_SHADE =
    /(?:bg|text|ring|border)-(?:red|green|yellow|blue|gray|grey|orange|purple|emerald|amber|slate|zinc|rose|cyan|indigo|violet|teal|lime|pink|fuchsia|sky|stone|neutral)-\d/;

  it("jsonSyntaxColors uses no raw palette shade", () => {
    const offenders = Object.entries(jsonSyntaxColors).filter(([, cls]) =>
      RAW_SHADE.test(String(cls)),
    );
    expect(offenders).toEqual([]);
  });

  it("the raw-palette matcher actually matches a raw shade", () => {
    // A guard whose regex silently stopped matching would pass everything.
    expect(RAW_SHADE.test("bg-blue-100 text-blue-800")).toBe(true);
    expect(RAW_SHADE.test("bg-success text-success-foreground")).toBe(false);
  });

  it("jsonSyntaxColors has key, string, number, boolean, punctuation", () => {
    expect(Object.keys(jsonSyntaxColors).sort()).toEqual([
      "boolean",
      "key",
      "number",
      "punctuation",
      "string",
    ]);
  });

  it("successTextColor is defined", () => {
    expect(successTextColor).toBeTruthy();
  });
});
