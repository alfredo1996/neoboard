import { describe, it, expect } from "vitest";
import {
  fieldTypeColors,
  connectionStatusColors,
  chartTypePreviewColors,
  jsonSyntaxColors,
  MAP_MARKER_DEFAULT_COLOR,
  successTextColor,
} from "../design-tokens";

describe("design-tokens", () => {
  it("fieldTypeColors covers all expected types", () => {
    expect(Object.keys(fieldTypeColors)).toEqual(
      expect.arrayContaining(["string", "number", "date", "boolean", "object"])
    );
  });

  it("connectionStatusColors covers all states", () => {
    expect(Object.keys(connectionStatusColors)).toEqual(
      expect.arrayContaining(["connected", "disconnected", "connecting", "error"])
    );
  });

  it("chartTypePreviewColors covers core chart types", () => {
    expect(Object.keys(chartTypePreviewColors)).toEqual(
      expect.arrayContaining(["bar", "line", "pie", "table", "graph", "map"])
    );
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
