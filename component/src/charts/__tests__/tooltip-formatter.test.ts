import { describe, it, expect } from "vitest";
import { buildTooltipFormatter } from "../chart-utils";
import type { TooltipParam } from "../chart-utils";

describe("buildTooltipFormatter", () => {
  it("returns a function", () => {
    const formatter = buildTooltipFormatter();
    expect(typeof formatter).toBe("function");
  });

  it("includes seriesName when provided", () => {
    const formatter = buildTooltipFormatter();
    const param: TooltipParam = {
      seriesName: "Revenue",
      value: 1234,
      name: "Jan",
      marker: '<span style="color:#3b82f6">●</span>',
    };
    const result = formatter(param);
    expect(result).toContain("Revenue: ");
    expect(result).toContain("Jan");
    expect(result).toContain("1234");
  });

  it("omits seriesName label when seriesName is undefined", () => {
    const formatter = buildTooltipFormatter();
    const param: TooltipParam = {
      value: 42,
      name: "Category A",
    };
    const result = formatter(param);
    expect(result).not.toContain("undefined");
    expect(result).toContain("42");
    expect(result).toContain("Category A");
  });

  it("omits seriesName label when seriesName is empty string", () => {
    const formatter = buildTooltipFormatter();
    const param: TooltipParam = {
      seriesName: "",
      value: 100,
      name: "X",
    };
    const result = formatter(param);
    expect(result).not.toContain(": <b>");
  });

  it("handles array params (axis trigger with multiple series)", () => {
    const formatter = buildTooltipFormatter();
    const params: TooltipParam[] = [
      { seriesName: "A", value: 100, name: "Jan", marker: "●" },
      { seriesName: "B", value: 200, name: "Jan", marker: "●" },
    ];
    const result = formatter(params);
    expect(result).toContain("A: ");
    expect(result).toContain("B: ");
    expect(result).toContain("100");
    expect(result).toContain("200");
    expect(result).toContain("Jan");
  });

  it("handles array value (e.g. scatter/candlestick)", () => {
    const formatter = buildTooltipFormatter();
    const param: TooltipParam = {
      seriesName: "Data",
      value: ["x", 999],
      name: "Point",
    };
    const result = formatter(param);
    expect(result).toContain("999");
  });

  it("handles missing value gracefully", () => {
    const formatter = buildTooltipFormatter();
    const param: TooltipParam = {
      seriesName: "Series",
      name: "Label",
    };
    const result = formatter(param);
    expect(result).toContain("Series: ");
    expect(result).toContain("<b></b>");
  });

  it("handles non-string marker gracefully", () => {
    const formatter = buildTooltipFormatter();
    const param: TooltipParam = {
      seriesName: "Test",
      value: 50,
      name: "X",
      marker: { type: "rich" } as unknown,
    };
    const result = formatter(param);
    expect(result).toContain("Test: ");
    expect(result).toContain("50");
    expect(result).not.toContain("[object");
  });
});
