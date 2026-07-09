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
