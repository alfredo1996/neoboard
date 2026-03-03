import { describe, it, expect } from "vitest";
import { parseColorThresholds, resolveThresholdColor } from "../color-threshold";

describe("parseColorThresholds", () => {
  it("returns empty array for empty string", () => {
    expect(parseColorThresholds("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(parseColorThresholds("   ")).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseColorThresholds("not-json")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseColorThresholds('{"value":10,"color":"red"}')).toEqual([]);
  });

  it("parses valid thresholds array", () => {
    const raw = JSON.stringify([
      { value: 50, color: "#ff0000" },
      { value: 100, color: "#00ff00" },
    ]);
    expect(parseColorThresholds(raw)).toEqual([
      { value: 50, color: "#ff0000" },
      { value: 100, color: "#00ff00" },
    ]);
  });

  it("filters out entries missing value or color", () => {
    const raw = JSON.stringify([
      { value: 50, color: "red" },
      { color: "blue" },
      { value: 80 },
      null,
      "string",
    ]);
    expect(parseColorThresholds(raw)).toEqual([{ value: 50, color: "red" }]);
  });

  it("filters out entries with non-numeric value", () => {
    const raw = JSON.stringify([{ value: "50", color: "red" }]);
    expect(parseColorThresholds(raw)).toEqual([]);
  });

  it("filters out entries with non-string color", () => {
    const raw = JSON.stringify([{ value: 50, color: 123 }]);
    expect(parseColorThresholds(raw)).toEqual([]);
  });
});

describe("resolveThresholdColor", () => {
  const thresholds = [
    { value: 50, color: "green" },
    { value: 100, color: "orange" },
  ];

  it("returns the first threshold color when value is at the threshold", () => {
    expect(resolveThresholdColor(50, thresholds)).toBe("green");
  });

  it("returns the first threshold color when value is below it", () => {
    expect(resolveThresholdColor(10, thresholds)).toBe("green");
  });

  it("returns the second threshold color when value is between thresholds", () => {
    expect(resolveThresholdColor(75, thresholds)).toBe("orange");
  });

  it("returns undefined when value exceeds all thresholds", () => {
    expect(resolveThresholdColor(150, thresholds)).toBeUndefined();
  });

  it("returns undefined for empty thresholds array", () => {
    expect(resolveThresholdColor(50, [])).toBeUndefined();
  });

  it("sorts thresholds by value before resolving", () => {
    const unsorted = [
      { value: 100, color: "orange" },
      { value: 50, color: "green" },
    ];
    expect(resolveThresholdColor(30, unsorted)).toBe("green");
  });
});
