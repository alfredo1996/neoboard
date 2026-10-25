import { describe, it, expect } from "vitest";
import { jsonSyntaxColors, successTextColor } from "../design-tokens";

describe("design-tokens", () => {
  // ── raw-palette ratchet (#1249) ──────────────────────────────────────────
  //
  // The rule is: no raw Tailwind palette shades in exported token maps, so
  // theming and dark mode keep working from one source.
  //
  // `jsonSyntaxColors` does NOT, and that is the open part of #1249: it
  // encodes *categorical* distinction (string vs number vs boolean), and no
  // semantic token expresses "is a date". The candidates are the
  // categorical chart vars (--chart-1..10, already colourblind-safe) or five new
  // tokens — a visible design change that needs a design review, not a cleanup.
  //
  // jsonSyntaxColors is the one documented raw-palette exception (#1249).
  // This asserts it is still *needed*, so the exception cannot rot into silent
  // permission after the map is tokenised.
  const RAW_SHADE =
    /(?:bg|text|ring|border)-(?:red|green|yellow|blue|gray|grey|orange|purple|emerald|amber|slate|zinc|rose|cyan|indigo|violet|teal|lime|pink|fuchsia|sky|stone|neutral)-\d/;

  it("jsonSyntaxColors is still the documented raw-palette exception", () => {
    const offenders = Object.entries(jsonSyntaxColors).filter(([, cls]) =>
      RAW_SHADE.test(String(cls)),
    );
    expect(
      offenders.length,
      "jsonSyntaxColors no longer uses raw palette shades: drop the exception and #1249",
    ).toBeGreaterThan(0);
  });

  it("the raw-palette matcher actually matches a raw shade", () => {
    // A guard whose regex silently stopped matching would pass everything.
    expect(RAW_SHADE.test("bg-blue-100 text-blue-800")).toBe(true);
    expect(RAW_SHADE.test("bg-success text-success-foreground")).toBe(false);
  });

  it("jsonSyntaxColors has string, number, boolean", () => {
    expect(jsonSyntaxColors.string).toBeDefined();
    expect(jsonSyntaxColors.number).toBeDefined();
    expect(jsonSyntaxColors.boolean).toBeDefined();
  });

  it("successTextColor is defined", () => {
    expect(successTextColor).toBeTruthy();
  });
});
