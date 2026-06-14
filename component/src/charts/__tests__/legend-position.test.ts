import { describe, it, expect } from "vitest";
import {
  buildLegend,
  resolveLegendPosition,
  buildCompactGrid,
} from "../chart-utils";

describe("resolveLegendPosition (#1053)", () => {
  it("passes through known positions", () => {
    expect(resolveLegendPosition("top")).toBe("top");
    expect(resolveLegendPosition("left")).toBe("left");
  });
  it("falls back to bottom for unknown/garbage values", () => {
    expect(resolveLegendPosition("diagonal")).toBe("bottom");
    expect(resolveLegendPosition(undefined)).toBe("bottom");
  });
});

describe("buildLegend (#1053)", () => {
  it("returns undefined when the legend is hidden", () => {
    expect(buildLegend(false, "top")).toBeUndefined();
  });
  it("places the legend at the requested edge", () => {
    expect(buildLegend(true, "top")).toMatchObject({ top: 0 });
    expect(buildLegend(true, "bottom")).toMatchObject({ bottom: 0 });
  });
  it("orients vertically for left/right", () => {
    expect(buildLegend(true, "left")).toMatchObject({
      orient: "vertical",
      left: 0,
    });
    expect(buildLegend(true, "right")).toMatchObject({
      orient: "vertical",
      right: 0,
    });
  });
});

describe("buildCompactGrid legend reservation (#1053)", () => {
  it("reserves bottom space for a bottom legend", () => {
    expect(buildCompactGrid(false, true, "bottom").bottom).toBe(40);
  });
  it("reserves the correct side for a right legend", () => {
    const grid = buildCompactGrid(false, true, "right");
    expect(grid.right).toBeGreaterThan(grid.left);
  });
  it("does not reserve legend space when the legend is hidden", () => {
    const grid = buildCompactGrid(false, false, "right");
    expect(grid.right).toBe(16);
  });
});
