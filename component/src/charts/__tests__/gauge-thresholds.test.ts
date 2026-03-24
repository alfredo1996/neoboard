import { describe, it, expect } from "vitest";
import { parseGaugeThresholdZones } from "../chart-utils";

describe("parseGaugeThresholdZones", () => {
  it("returns default single gray zone for empty input", () => {
    const result = parseGaugeThresholdZones(undefined, 0, 100);
    expect(result).toEqual([[1, "#E6EBF8"]]);
  });

  it("parses valid threshold zones", () => {
    const input = JSON.stringify([
      { value: 30, color: "#67e0e3" },
      { value: 70, color: "#37a2da" },
      { value: 100, color: "#fd666d" },
    ]);
    const result = parseGaugeThresholdZones(input, 0, 100);
    expect(result).toEqual([
      [0.3, "#67e0e3"],
      [0.7, "#37a2da"],
      [1, "#fd666d"],
    ]);
  });

  it("normalizes values to percentages based on min/max", () => {
    const input = JSON.stringify([
      { value: 50, color: "green" },
      { value: 200, color: "red" },
    ]);
    const result = parseGaugeThresholdZones(input, 0, 200);
    expect(result).toEqual([
      [0.25, "green"],
      [1, "red"],
    ]);
  });

  it("returns default for invalid JSON", () => {
    const result = parseGaugeThresholdZones("not-json", 0, 100);
    expect(result).toEqual([[1, "#E6EBF8"]]);
  });
});
