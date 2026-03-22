import { describe, it, expect } from "vitest";
import { parseReferenceLines } from "../chart-utils";
import type { ReferenceLine } from "../chart-utils";

describe("parseReferenceLines", () => {
  it("returns empty array for undefined input", () => {
    expect(parseReferenceLines(undefined)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseReferenceLines("")).toEqual([]);
  });

  it("parses a single horizontal reference line", () => {
    const input = JSON.stringify([{ value: 50, label: "Target", color: "#ff0000" }]);
    const result = parseReferenceLines(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ value: 50, label: "Target", color: "#ff0000" });
  });

  it("parses multiple reference lines", () => {
    const input = JSON.stringify([
      { value: 25, label: "Low" },
      { value: 75, label: "High", color: "#00ff00" },
    ]);
    const result = parseReferenceLines(input);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseReferenceLines("not-json")).toEqual([]);
  });

  it("filters out entries without a value", () => {
    const input = JSON.stringify([{ label: "No value" }, { value: 50, label: "OK" }]);
    const result = parseReferenceLines(input);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(50);
  });
});

describe("ReferenceLine type", () => {
  it("accepts minimal reference line", () => {
    const line: ReferenceLine = { value: 100 };
    expect(line.value).toBe(100);
  });
});
