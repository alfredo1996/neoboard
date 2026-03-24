import { describe, it, expect } from "vitest";
import {
  resolveCellFormat,
  interpolateColor,
} from "../styling-rule";
import type { CellFormatRule, ColorScaleConfig } from "../styling-rule";

function rule(overrides: Partial<CellFormatRule> = {}): CellFormatRule {
  return {
    id: "r1",
    column: "score",
    operator: ">=",
    value: 80,
    style: { backgroundColor: "#22c55e" },
    ...overrides,
  };
}

describe("resolveCellFormat", () => {
  it("returns undefined when rules array is empty", () => {
    expect(resolveCellFormat(42, "score", [])).toBeUndefined();
  });

  it("returns undefined when column does not match any rule", () => {
    const rules = [rule({ column: "other" })];
    expect(resolveCellFormat(90, "score", rules)).toBeUndefined();
  });

  it("matches rule when column and condition match", () => {
    const rules = [rule({ column: "score", operator: ">=", value: 80, style: { backgroundColor: "#green" } })];
    expect(resolveCellFormat(90, "score", rules)).toEqual({ backgroundColor: "#green" });
  });

  it("does not match when condition fails", () => {
    const rules = [rule({ column: "score", operator: ">=", value: 80 })];
    expect(resolveCellFormat(50, "score", rules)).toBeUndefined();
  });

  describe("operators", () => {
    it("> matches strictly greater", () => {
      const rules = [rule({ operator: ">", value: 50, style: { textColor: "#red" } })];
      expect(resolveCellFormat(51, "score", rules)).toEqual({ textColor: "#red" });
      expect(resolveCellFormat(50, "score", rules)).toBeUndefined();
    });

    it("< matches strictly less", () => {
      const rules = [rule({ operator: "<", value: 50, style: { bold: true } })];
      expect(resolveCellFormat(49, "score", rules)).toEqual({ bold: true });
      expect(resolveCellFormat(50, "score", rules)).toBeUndefined();
    });

    it("== matches equal values", () => {
      const rules = [rule({ operator: "==", value: 100, style: { icon: "check" } })];
      expect(resolveCellFormat(100, "score", rules)).toEqual({ icon: "check" });
      expect(resolveCellFormat(99, "score", rules)).toBeUndefined();
    });

    it("== matches strings case-insensitively", () => {
      const rules = [rule({ operator: "==", value: "active", style: { backgroundColor: "#green" } })];
      expect(resolveCellFormat("Active", "score", rules)).toEqual({ backgroundColor: "#green" });
      expect(resolveCellFormat("inactive", "score", rules)).toBeUndefined();
    });

    it("contains matches substring", () => {
      const rules = [rule({ operator: "contains", value: "err", style: { textColor: "#red" } })];
      expect(resolveCellFormat("Error occurred", "score", rules)).toEqual({ textColor: "#red" });
      expect(resolveCellFormat("Success", "score", rules)).toBeUndefined();
    });

    it("<= matches less than or equal", () => {
      const rules = [rule({ operator: "<=", value: 50, style: { bold: true } })];
      expect(resolveCellFormat(50, "score", rules)).toEqual({ bold: true });
      expect(resolveCellFormat(49, "score", rules)).toEqual({ bold: true });
      expect(resolveCellFormat(51, "score", rules)).toBeUndefined();
    });

    it("!= matches not equal", () => {
      const rules = [rule({ operator: "!=", value: 100, style: { textColor: "#red" } })];
      expect(resolveCellFormat(99, "score", rules)).toEqual({ textColor: "#red" });
      expect(resolveCellFormat(100, "score", rules)).toBeUndefined();
    });

    it("not_contains matches absent substring", () => {
      const rules = [rule({ operator: "not_contains", value: "xyz", style: { bold: true } })];
      expect(resolveCellFormat("Hello", "score", rules)).toEqual({ bold: true });
      expect(resolveCellFormat("xyz stuff", "score", rules)).toBeUndefined();
    });

    it("starts_with matches prefix", () => {
      const rules = [rule({ operator: "starts_with", value: "err", style: { textColor: "#red" } })];
      expect(resolveCellFormat("Error!", "score", rules)).toEqual({ textColor: "#red" });
      expect(resolveCellFormat("No error", "score", rules)).toBeUndefined();
    });

    it("ends_with matches suffix", () => {
      const rules = [rule({ operator: "ends_with", value: "ok", style: { backgroundColor: "#green" } })];
      expect(resolveCellFormat("all ok", "score", rules)).toEqual({ backgroundColor: "#green" });
      expect(resolveCellFormat("ok sure", "score", rules)).toBeUndefined();
    });

    it("is_not_null matches non-null values", () => {
      const rules = [rule({ operator: "is_not_null", value: 0, style: { bold: true } })];
      expect(resolveCellFormat("value", "score", rules)).toEqual({ bold: true });
      expect(resolveCellFormat(0, "score", rules)).toEqual({ bold: true });
      expect(resolveCellFormat(null, "score", rules)).toBeUndefined();
    });

    it("contains skips null cell values", () => {
      const rules = [rule({ operator: "contains", value: "x", style: { bold: true } })];
      expect(resolveCellFormat(null, "score", rules)).toBeUndefined();
    });

    it("between skips NaN cell values", () => {
      const rules = [rule({ operator: "between", value: 0, valueTo: 100, style: { bold: true } })];
      expect(resolveCellFormat("abc", "score", rules)).toBeUndefined();
    });

    it("between skips when valueTo is missing", () => {
      const rules = [rule({ operator: "between", value: 0, style: { bold: true } })];
      expect(resolveCellFormat(50, "score", rules)).toBeUndefined();
    });

    it("== falls back to string comparison for non-numeric", () => {
      const rules = [rule({ operator: "==", value: "yes", style: { bold: true } })];
      expect(resolveCellFormat("YES", "score", rules)).toEqual({ bold: true });
    });

    it("!= falls back to string comparison for non-numeric", () => {
      const rules = [rule({ operator: "!=", value: "yes", style: { bold: true } })];
      expect(resolveCellFormat("no", "score", rules)).toEqual({ bold: true });
      expect(resolveCellFormat("yes", "score", rules)).toBeUndefined();
    });
  });

  it("first-match-wins across multiple rules", () => {
    const rules = [
      rule({ id: "a", operator: "<", value: 30, style: { backgroundColor: "#red" } }),
      rule({ id: "b", operator: "<", value: 70, style: { backgroundColor: "#yellow" } }),
      rule({ id: "c", operator: ">=", value: 70, style: { backgroundColor: "#green" } }),
    ];
    expect(resolveCellFormat(20, "score", rules)).toEqual({ backgroundColor: "#red" });
    expect(resolveCellFormat(50, "score", rules)).toEqual({ backgroundColor: "#yellow" });
    expect(resolveCellFormat(90, "score", rules)).toEqual({ backgroundColor: "#green" });
  });

  it("merges styles from first matching rule only (no cascading)", () => {
    const rules = [
      rule({ id: "a", operator: ">=", value: 80, style: { bold: true, icon: "star" } }),
      rule({ id: "b", operator: ">=", value: 0, style: { backgroundColor: "#blue" } }),
    ];
    // Should return only the first match's style
    expect(resolveCellFormat(90, "score", rules)).toEqual({ bold: true, icon: "star" });
  });

  it("handles null/undefined cell values with is_null operator", () => {
    const rules = [rule({ operator: "is_null", value: 0, style: { textColor: "#gray" } })];
    expect(resolveCellFormat(null, "score", rules)).toEqual({ textColor: "#gray" });
    expect(resolveCellFormat(undefined, "score", rules)).toEqual({ textColor: "#gray" });
    expect(resolveCellFormat("", "score", rules)).toEqual({ textColor: "#gray" });
  });

  it("handles between operator", () => {
    const rules = [rule({ operator: "between", value: 10, valueTo: 50, style: { backgroundColor: "#yellow" } })];
    expect(resolveCellFormat(30, "score", rules)).toEqual({ backgroundColor: "#yellow" });
    expect(resolveCellFormat(60, "score", rules)).toBeUndefined();
  });
});

describe("interpolateColor", () => {
  it("returns minColor at min value", () => {
    expect(interpolateColor(0, 0, 100, "#ff0000", "#00ff00")).toBe("#ff0000");
  });

  it("returns maxColor at max value", () => {
    expect(interpolateColor(100, 0, 100, "#ff0000", "#00ff00")).toBe("#00ff00");
  });

  it("returns midpoint color at 50%", () => {
    // #ff0000 (255,0,0) to #00ff00 (0,255,0) at 50% = (128,128,0) = #808000
    const result = interpolateColor(50, 0, 100, "#ff0000", "#00ff00");
    expect(result).toBe("#808000");
  });

  it("clamps below min to minColor", () => {
    expect(interpolateColor(-10, 0, 100, "#ff0000", "#00ff00")).toBe("#ff0000");
  });

  it("clamps above max to maxColor", () => {
    expect(interpolateColor(200, 0, 100, "#ff0000", "#00ff00")).toBe("#00ff00");
  });

  it("handles min === max by returning minColor", () => {
    expect(interpolateColor(50, 50, 50, "#ff0000", "#00ff00")).toBe("#ff0000");
  });

  it("works with 3-char hex shorthand", () => {
    // #f00 → #ff0000, #0f0 → #00ff00
    expect(interpolateColor(0, 0, 100, "#f00", "#0f0")).toBe("#ff0000");
    expect(interpolateColor(100, 0, 100, "#f00", "#0f0")).toBe("#00ff00");
  });

  it("returns correct color at 25%", () => {
    // #000000 to #ffffff at 25% → each channel = 64 = 0x40
    expect(interpolateColor(25, 0, 100, "#000000", "#ffffff")).toBe("#404040");
  });
});
