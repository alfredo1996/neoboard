import { describe, it, expect } from "vitest";
import { formatParameterValue, filterParentParams } from "@/lib/format-parameter-value";
import type { ParameterEntry } from "@/stores/parameter-store";

describe("formatParameterValue", () => {
  it("converts relative date preset to human label", () => {
    expect(formatParameterValue("last_7_days")).toBe("Last 7 days");
    expect(formatParameterValue("today")).toBe("Today");
    expect(formatParameterValue("this_month")).toBe("This month");
  });

  it("passes through plain strings that are not presets", () => {
    expect(formatParameterValue("some_value")).toBe("some_value");
  });

  it("formats number range as min – max", () => {
    expect(formatParameterValue([10, 100])).toBe("10 – 100");
  });

  it("formats array of strings as comma-separated", () => {
    expect(formatParameterValue(["a", "b", "c"])).toBe("a, b, c");
  });

  it("formats date range object with arrow", () => {
    expect(formatParameterValue({ from: "2024-01-01", to: "2024-12-31" }))
      .toBe("2024-01-01 → 2024-12-31");
  });

  it("returns empty string for null/undefined", () => {
    expect(formatParameterValue(null)).toBe("");
    expect(formatParameterValue(undefined)).toBe("");
  });

  it("stringifies numbers and booleans", () => {
    expect(formatParameterValue(42)).toBe("42");
    expect(formatParameterValue(true)).toBe("true");
  });
});

describe("filterParentParams", () => {
  const entry = (value: unknown): ParameterEntry => ({
    value,
    source: "test",
    field: "test",
    type: "text",
    sourceType: "selector-widget",
  });

  it("filters out parent when sub-params _from/_to exist", () => {
    const entries: [string, ParameterEntry][] = [
      ["dates", entry("last_7_days")],
      ["dates_from", entry("2024-01-01")],
      ["dates_to", entry("2024-01-07")],
    ];
    const result = filterParentParams(entries);
    const names = result.map(([n]) => n);
    expect(names).not.toContain("dates");
    expect(names).toContain("dates_from");
    expect(names).toContain("dates_to");
  });

  it("filters out parent when sub-params _min/_max exist", () => {
    const entries: [string, ParameterEntry][] = [
      ["price", entry([10, 100])],
      ["price_min", entry(10)],
      ["price_max", entry(100)],
    ];
    const result = filterParentParams(entries);
    const names = result.map(([n]) => n);
    expect(names).not.toContain("price");
    expect(names).toContain("price_min");
    expect(names).toContain("price_max");
  });

  it("keeps standalone params that have no sub-params", () => {
    const entries: [string, ParameterEntry][] = [
      ["status", entry("active")],
      ["category", entry("all")],
    ];
    const result = filterParentParams(entries);
    expect(result).toHaveLength(2);
  });
});
