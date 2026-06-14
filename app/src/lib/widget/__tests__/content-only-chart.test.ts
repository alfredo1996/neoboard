import { describe, it, expect } from "vitest";
import { isContentOnlyChartType } from "../content-only-chart";

describe("isContentOnlyChartType (#1053)", () => {
  it("is true for markdown and iframe", () => {
    expect(isContentOnlyChartType("markdown")).toBe(true);
    expect(isContentOnlyChartType("iframe")).toBe(true);
  });

  it("is false for data-driven chart types", () => {
    expect(isContentOnlyChartType("bar")).toBe(false);
    expect(isContentOnlyChartType("table")).toBe(false);
    expect(isContentOnlyChartType("form")).toBe(false);
  });
});
