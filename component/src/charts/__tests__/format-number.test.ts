import { describe, it, expect } from "vitest";
import { formatNumber, buildTooltipFormatter } from "../chart-utils";

describe("formatNumber", () => {
  it("returns plain number by default", () => {
    expect(formatNumber(1234)).toBe("1234");
  });

  it("respects decimalPlaces", () => {
    expect(formatNumber(3.14159, { decimalPlaces: 2 })).toBe("3.14");
  });

  it("pads with zeros when decimalPlaces exceeds precision", () => {
    expect(formatNumber(5, { decimalPlaces: 2 })).toBe("5.00");
  });

  it("applies comma formatting", () => {
    expect(formatNumber(1234567, { numberFormat: "comma" })).toBe("1,234,567");
  });

  it("applies comma formatting with decimalPlaces", () => {
    expect(formatNumber(1234567.891, { numberFormat: "comma", decimalPlaces: 2 })).toBe("1,234,567.89");
  });

  it("applies compact notation", () => {
    const result = formatNumber(1500000, { numberFormat: "compact" });
    expect(result).toMatch(/1\.5M/i);
  });

  it("applies compact notation with decimalPlaces", () => {
    const result = formatNumber(1234, { numberFormat: "compact", decimalPlaces: 1 });
    expect(result).toMatch(/1\.2K/i);
  });

  it("applies percent format", () => {
    expect(formatNumber(75, { numberFormat: "percent" })).toBe("75%");
  });

  it("applies percent format with decimalPlaces", () => {
    expect(formatNumber(75.678, { numberFormat: "percent", decimalPlaces: 1 })).toBe("75.7%");
  });

  it("adds prefix", () => {
    expect(formatNumber(100, { prefix: "$" })).toBe("$100");
  });

  it("adds suffix", () => {
    expect(formatNumber(100, { suffix: " items" })).toBe("100 items");
  });

  it("combines prefix, suffix, decimalPlaces, and comma", () => {
    expect(formatNumber(9876.5, { prefix: "$", suffix: "M", numberFormat: "comma", decimalPlaces: 1 })).toBe("$9,876.5M");
  });

  it("handles zero", () => {
    expect(formatNumber(0, { decimalPlaces: 2 })).toBe("0.00");
  });

  it("handles negative numbers", () => {
    expect(formatNumber(-42.567, { decimalPlaces: 1 })).toBe("-42.6");
  });

  it("returns string values unchanged", () => {
    expect(formatNumber("N/A" as unknown as number)).toBe("N/A");
  });
});

describe("buildTooltipFormatter", () => {
  it("returns a function", () => {
    const formatter = buildTooltipFormatter({});
    expect(typeof formatter).toBe("function");
  });

  it("formats a single value with config", () => {
    const formatter = buildTooltipFormatter({ decimalPlaces: 1, prefix: "$" });
    // ECharts tooltip params shape for axis trigger
    const result = formatter({
      seriesName: "Revenue",
      value: 1234.56,
      name: "Jan",
      marker: '<span style="color:#3b82f6">●</span>',
    });
    expect(result).toContain("$1,234.6");
    expect(result).toContain("Revenue");
  });

  it("handles array params (axis trigger with multiple series)", () => {
    const formatter = buildTooltipFormatter({ decimalPlaces: 0 });
    const result = formatter([
      { seriesName: "A", value: 100.7, name: "Jan", marker: "●" },
      { seriesName: "B", value: 200.3, name: "Jan", marker: "●" },
    ]);
    expect(result).toContain("101");
    expect(result).toContain("200");
  });
});
