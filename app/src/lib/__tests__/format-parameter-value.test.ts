import { describe, it, expect } from "vitest";
import { formatParameterValue, filterParentParams } from "../format-parameter-value";
import type { ParameterEntry } from "@/stores/parameter-store";

// ---------------------------------------------------------------------------
// formatParameterValue
// ---------------------------------------------------------------------------

describe("formatParameterValue", () => {
  it("returns empty string for null", () => {
    expect(formatParameterValue(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatParameterValue(undefined)).toBe("");
  });

  it("returns the string as-is for plain strings", () => {
    expect(formatParameterValue("hello")).toBe("hello");
  });

  it("converts number to string", () => {
    expect(formatParameterValue(42)).toBe("42");
    expect(formatParameterValue(0)).toBe("0");
    expect(formatParameterValue(-3.14)).toBe("-3.14");
  });

  it("converts boolean to string", () => {
    expect(formatParameterValue(true)).toBe("true");
    expect(formatParameterValue(false)).toBe("false");
  });

  // Relative date presets
  it("maps 'today' to 'Today'", () => {
    expect(formatParameterValue("today")).toBe("Today");
  });

  it("maps 'yesterday' to 'Yesterday'", () => {
    expect(formatParameterValue("yesterday")).toBe("Yesterday");
  });

  it("maps 'last_7_days' to 'Last 7 days'", () => {
    expect(formatParameterValue("last_7_days")).toBe("Last 7 days");
  });

  it("maps 'last_30_days' to 'Last 30 days'", () => {
    expect(formatParameterValue("last_30_days")).toBe("Last 30 days");
  });

  it("maps 'last_90_days' to 'Last 90 days'", () => {
    expect(formatParameterValue("last_90_days")).toBe("Last 90 days");
  });

  it("maps 'this_month' to 'This month'", () => {
    expect(formatParameterValue("this_month")).toBe("This month");
  });

  it("maps 'last_month' to 'Last month'", () => {
    expect(formatParameterValue("last_month")).toBe("Last month");
  });

  it("maps 'this_quarter' to 'This quarter'", () => {
    expect(formatParameterValue("this_quarter")).toBe("This quarter");
  });

  it("maps 'this_year' to 'This year'", () => {
    expect(formatParameterValue("this_year")).toBe("This year");
  });

  it("maps 'last_year' to 'Last year'", () => {
    expect(formatParameterValue("last_year")).toBe("Last year");
  });

  it("returns unknown string keys as-is (not a preset)", () => {
    expect(formatParameterValue("some_custom_value")).toBe("some_custom_value");
  });

  // Number range (2-element numeric tuple)
  it("formats a [min, max] number range with en-dash", () => {
    expect(formatParameterValue([10, 500])).toBe("10 – 500");
  });

  // Generic arrays
  it("formats a string array as comma-separated", () => {
    expect(formatParameterValue(["a", "b", "c"])).toBe("a, b, c");
  });

  it("formats a number array with 3+ elements as comma-separated", () => {
    expect(formatParameterValue([1, 2, 3])).toBe("1, 2, 3");
  });

  it("formats a single-element array", () => {
    expect(formatParameterValue(["only"])).toBe("only");
  });

  it("formats an empty array", () => {
    expect(formatParameterValue([])).toBe("");
  });

  // Date range objects
  it("formats an object with from/to as arrow notation", () => {
    expect(formatParameterValue({ from: "2024-01-01", to: "2024-12-31" })).toBe(
      "2024-01-01 → 2024-12-31"
    );
  });

  // Fallback
  it("stringifies other objects via String()", () => {
    expect(formatParameterValue({ foo: "bar" })).toBe("[object Object]");
  });
});

// ---------------------------------------------------------------------------
// filterParentParams
// ---------------------------------------------------------------------------

describe("filterParentParams", () => {
  function entry(value: unknown = "v"): ParameterEntry {
    return {
      value,
      source: "test",
      field: "f",
      type: "text",
      sourceType: "click-action",
    };
  }

  it("returns all entries when no sub-parameters exist", () => {
    const entries: [string, ParameterEntry][] = [
      ["alpha", entry()],
      ["beta", entry()],
    ];
    expect(filterParentParams(entries)).toEqual(entries);
  });

  it("hides parent when _from sub-param exists", () => {
    const entries: [string, ParameterEntry][] = [
      ["dates", entry()],
      ["dates_from", entry()],
      ["dates_to", entry()],
    ];
    const result = filterParentParams(entries);
    expect(result.map(([n]) => n)).toEqual(["dates_from", "dates_to"]);
  });

  it("hides parent when _min sub-param exists", () => {
    const entries: [string, ParameterEntry][] = [
      ["price", entry()],
      ["price_min", entry()],
      ["price_max", entry()],
    ];
    const result = filterParentParams(entries);
    expect(result.map(([n]) => n)).toEqual(["price_min", "price_max"]);
  });

  it("does not hide parent when no matching suffix sub-params exist", () => {
    const entries: [string, ParameterEntry][] = [
      ["price", entry()],
      ["price_label", entry()], // Not a known suffix
    ];
    expect(filterParentParams(entries)).toEqual(entries);
  });

  it("handles empty array", () => {
    expect(filterParentParams([])).toEqual([]);
  });

  it("does not hide sub-params that also have their own sub-params", () => {
    // Edge case: dates_from does not have dates_from_from or dates_from_to
    const entries: [string, ParameterEntry][] = [
      ["dates", entry()],
      ["dates_from", entry()],
    ];
    const result = filterParentParams(entries);
    expect(result.map(([n]) => n)).toEqual(["dates_from"]);
  });

  it("only hides parent with _to suffix", () => {
    const entries: [string, ParameterEntry][] = [
      ["period", entry()],
      ["period_to", entry()],
    ];
    const result = filterParentParams(entries);
    expect(result.map(([n]) => n)).toEqual(["period_to"]);
  });
});
