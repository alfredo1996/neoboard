import { describe, it, expect } from "vitest";
import { interpolateTitle } from "@/lib/widget/interpolate-title";
import type { ParameterEntry } from "@/stores/parameter-store";

function entry(value: unknown): ParameterEntry {
  return {
    value,
    source: "test",
    field: "f",
    type: "text",
    sourceType: "click-action",
  };
}

describe("interpolateTitle", () => {
  it("returns title unchanged when there are no tokens", () => {
    const params: Record<string, ParameterEntry> = { genre: entry("Action") };
    expect(interpolateTitle("Movies Overview", params)).toBe("Movies Overview");
  });

  it("replaces a single $param_ token with its value", () => {
    const params: Record<string, ParameterEntry> = { genre: entry("Action") };
    expect(interpolateTitle("Movies by $param_genre", params)).toBe(
      "Movies by Action",
    );
  });

  it("replaces multiple $param_ tokens", () => {
    const params: Record<string, ParameterEntry> = {
      genre: entry("Action"),
      year: entry(2024),
    };
    expect(interpolateTitle("$param_genre movies in $param_year", params)).toBe(
      "Action movies in 2024",
    );
  });

  it("names an unset parameter in words, in brackets", () => {
    const params: Record<string, ParameterEntry> = {};
    expect(interpolateTitle("Movies by $param_genre", params)).toBe(
      "Movies by [Genre]",
    );
  });

  it("names a null-valued parameter in words", () => {
    const params: Record<string, ParameterEntry> = { genre: entry(null) };
    expect(interpolateTitle("Movies by $param_genre", params)).toBe(
      "Movies by [Genre]",
    );
  });

  it("names an undefined-valued parameter in words", () => {
    const params: Record<string, ParameterEntry> = { genre: entry(undefined) };
    expect(interpolateTitle("Movies by $param_genre", params)).toBe(
      "Movies by [Genre]",
    );
  });

  it("handles one set and one unset token in the same title", () => {
    const params: Record<string, ParameterEntry> = { year: entry(2024) };
    expect(
      interpolateTitle("Revenue in $param_gallery_region, $param_year", params),
    ).toBe("Revenue in [Gallery region], 2024");
  });

  it.each<[string, unknown, string]>([
    ["an empty string", "", "Movies by [Genre]"],
    ["an empty array", [], "Movies by [Genre]"],
    ["zero", 0, "Movies by 0"],
  ])("treats %s as the body does (#2214)", (_n, value, expected) => {
    expect(
      interpolateTitle("Movies by $param_genre", { genre: entry(value) }),
    ).toBe(expected);
  });

  it("formats numeric parameter values", () => {
    const params: Record<string, ParameterEntry> = { count: entry(42) };
    expect(interpolateTitle("Total: $param_count", params)).toBe("Total: 42");
  });

  it("formats boolean parameter values", () => {
    const params: Record<string, ParameterEntry> = { active: entry(true) };
    expect(interpolateTitle("Active: $param_active", params)).toBe(
      "Active: true",
    );
  });

  it("formats array parameter values", () => {
    const params: Record<string, ParameterEntry> = {
      tags: entry(["a", "b", "c"]),
    };
    expect(interpolateTitle("Tags: $param_tags", params)).toBe("Tags: a, b, c");
  });

  it("formats date range parameter values", () => {
    const params: Record<string, ParameterEntry> = {
      dates: entry({ from: "2024-01-01", to: "2024-12-31" }),
    };
    expect(interpolateTitle("Period: $param_dates", params)).toBe(
      "Period: 2024-01-01 → 2024-12-31",
    );
  });

  it("returns empty string for empty title", () => {
    const params: Record<string, ParameterEntry> = { genre: entry("Action") };
    expect(interpolateTitle("", params)).toBe("");
  });

  it("handles empty parameters object", () => {
    expect(interpolateTitle("Movies by $param_genre", {})).toBe(
      "Movies by [Genre]",
    );
  });

  it("handles duplicate tokens for the same parameter", () => {
    const params: Record<string, ParameterEntry> = { x: entry("val") };
    expect(interpolateTitle("$param_x and $param_x", params)).toBe(
      "val and val",
    );
  });
});
