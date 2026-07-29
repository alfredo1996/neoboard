import { describe, it, expect } from "vitest";
import {
  fieldTypeColors,
  connectionStatusColors,
  jsonSyntaxColors,
  MAP_MARKER_DEFAULT_COLOR,
  successTextColor,
} from "../design-tokens";

describe("design-tokens", () => {
  it("fieldTypeColors covers all expected types", () => {
    expect(Object.keys(fieldTypeColors)).toEqual(
      expect.arrayContaining(["string", "number", "date", "boolean", "object"]),
    );
  });

  it("connectionStatusColors covers all states", () => {
    expect(Object.keys(connectionStatusColors)).toEqual(
      expect.arrayContaining([
        "connected",
        "disconnected",
        "connecting",
        "error",
      ]),
    );
  });

  it("connectionStatusColors uses semantic tokens, not raw palette", () => {
    // Dots must track the theme via semantic tokens (bg-success etc.), never
    // hardcoded palette shades like bg-green-500.
    for (const cls of Object.values(connectionStatusColors)) {
      expect(cls).not.toMatch(/bg-(red|green|yellow|blue|gray|orange)-\d/);
    }
    expect(connectionStatusColors.connected).toContain("bg-success");
    expect(connectionStatusColors.error).toContain("bg-destructive");
    expect(connectionStatusColors.connecting).toContain("bg-warning");
  });

  // ── raw-palette ratchet (#1249) ──────────────────────────────────────────
  //
  // The rule is: no raw Tailwind palette shades in exported token maps, so
  // theming and dark mode keep working from one source.
  //
  // `connectionStatusColors` satisfies it because its states map cleanly onto
  // semantic tokens (connected/error/connecting -> success/destructive/warning).
  //
  // `fieldTypeColors` and `jsonSyntaxColors` do NOT, and that is the open part
  // of #1249: they encode *categorical* distinction (string vs number vs date),
  // and no semantic token expresses "is a date". The candidates are the
  // categorical chart vars (--chart-1..10, already colourblind-safe) or five new
  // tokens — a visible design change that needs a design review, not a cleanup.
  //
  // So this is a ratchet, not a clean slate: the two maps below are listed
  // explicitly, and anything NEW must be tokenised.
  const RAW_PALETTE_ALLOWED = new Set(["fieldTypeColors", "jsonSyntaxColors"]);

  const RAW_SHADE =
    /(?:bg|text|ring|border)-(?:red|green|yellow|blue|gray|grey|orange|purple|emerald|amber|slate|zinc|rose|cyan|indigo|violet|teal|lime|pink|fuchsia|sky|stone|neutral)-\d/;

  it.each([
    ["connectionStatusColors", connectionStatusColors],
    ["fieldTypeColors", fieldTypeColors],
    ["jsonSyntaxColors", jsonSyntaxColors],
  ])("%s uses semantic tokens, or is a documented exception", (name, map) => {
    const offenders = Object.entries(map)
      .filter(([, cls]) => RAW_SHADE.test(String(cls)))
      .map(([k]) => k);

    if (RAW_PALETTE_ALLOWED.has(name)) {
      // Documented exception — assert it is still *needed*, so the allowlist
      // cannot rot into silent permission after the maps are tokenised.
      expect(
        offenders.length,
        `${name} is allowlisted but no longer uses raw palette shades — remove it from RAW_PALETTE_ALLOWED and from #1249`,
      ).toBeGreaterThan(0);
      return;
    }

    expect(
      offenders,
      `${name} must use semantic tokens; raw palette shades found on: ${offenders.join(", ")}`,
    ).toEqual([]);
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

  it("MAP_MARKER_DEFAULT_COLOR is a valid hex color", () => {
    expect(MAP_MARKER_DEFAULT_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("successTextColor is defined", () => {
    expect(successTextColor).toBeTruthy();
  });
});
