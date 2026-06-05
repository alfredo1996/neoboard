import { describe, it, expect } from "vitest";
import { formatNumber, buildTooltipFormatter } from "../chart-utils";

describe("formatNumber", () => {
  // ─── Defaults (#911) ────────────────────────────────────────────────────
  // When *both* numberFormat and decimalPlaces are unconfigured, fall back
  // to comma + 2dp — readable, Excel-like, predictable. If either is
  // explicitly set, respect it (even decimalPlaces: 0).

  it("uses comma + 2 decimal places when neither option is set", () => {
    expect(formatNumber(1234)).toBe("1,234.00");
    expect(formatNumber(0.123456789)).toBe("0.12");
    expect(formatNumber(1000000)).toBe("1,000,000.00");
  });

  it("respects explicit decimalPlaces=0 (does not re-apply default)", () => {
    // dp: 0 is an explicit user choice — disables the 2dp default. nf is
    // still unconfigured, so falls back to "plain" (no comma) per the
    // existing zero-config-without-defaults behavior.
    expect(formatNumber(1234, { decimalPlaces: 0 })).toBe("1234");
  });

  it("respects explicit numberFormat without overriding decimalPlaces", () => {
    // numberFormat explicit, decimalPlaces undefined → use comma at native
    // precision; don't sneak in the 2dp default behind the user's back.
    expect(formatNumber(1234, { numberFormat: "comma" })).toBe("1,234");
    expect(formatNumber(1234.5, { numberFormat: "comma" })).toBe("1,234.5");
  });

  it("respects explicit numberFormat: plain (opt out of formatting)", () => {
    expect(formatNumber(1234, { numberFormat: "plain" })).toBe("1234");
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
    expect(
      formatNumber(1234567.891, { numberFormat: "comma", decimalPlaces: 2 }),
    ).toBe("1,234,567.89");
  });

  it("applies compact notation", () => {
    const result = formatNumber(1500000, { numberFormat: "compact" });
    expect(result).toMatch(/1\.5M/i);
  });

  it("applies compact notation with decimalPlaces", () => {
    const result = formatNumber(1234, {
      numberFormat: "compact",
      decimalPlaces: 1,
    });
    expect(result).toMatch(/1\.2K/i);
  });

  it("applies percent format", () => {
    expect(formatNumber(75, { numberFormat: "percent" })).toBe("75%");
  });

  it("applies percent format with decimalPlaces", () => {
    expect(
      formatNumber(75.678, { numberFormat: "percent", decimalPlaces: 1 }),
    ).toBe("75.7%");
  });

  it("adds prefix (and applies new defaults — prefix doesn't count as set)", () => {
    expect(formatNumber(100, { prefix: "$" })).toBe("$100.00");
  });

  it("adds suffix (and applies new defaults — suffix doesn't count as set)", () => {
    expect(formatNumber(100, { suffix: " items" })).toBe("100.00 items");
  });

  it("combines prefix, suffix, decimalPlaces, and comma", () => {
    expect(
      formatNumber(9876.5, {
        prefix: "$",
        suffix: "M",
        numberFormat: "comma",
        decimalPlaces: 1,
      }),
    ).toBe("$9,876.5M");
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

  it("omits seriesName label when seriesName is undefined", () => {
    const formatter = buildTooltipFormatter({});
    const result = formatter({ value: 42, name: "Jan" });
    expect(result).not.toContain("undefined");
    expect(result).toContain("<b>");
  });

  it("omits seriesName label when seriesName is empty string", () => {
    const formatter = buildTooltipFormatter({});
    const result = formatter({ seriesName: "", value: 42, name: "Jan" });
    expect(result).not.toContain(": <b>");
  });
});
