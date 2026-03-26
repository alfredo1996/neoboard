import { describe, it, expect } from "vitest";
import { evaluateCellRule, resolveCellStyle } from "../cell-formatting";
import type { CellFormattingRule } from "../cell-formatting";

describe("evaluateCellRule", () => {
  it("evaluates > condition", () => {
    expect(evaluateCellRule({ operator: ">", value: 50 }, 60)).toBe(true);
    expect(evaluateCellRule({ operator: ">", value: 50 }, 40)).toBe(false);
  });

  it("evaluates < condition", () => {
    expect(evaluateCellRule({ operator: "<", value: 50 }, 40)).toBe(true);
    expect(evaluateCellRule({ operator: "<", value: 50 }, 60)).toBe(false);
  });

  it("evaluates == condition for numbers", () => {
    expect(evaluateCellRule({ operator: "==", value: 42 }, 42)).toBe(true);
    expect(evaluateCellRule({ operator: "==", value: 42 }, 43)).toBe(false);
  });

  it("evaluates == condition for strings", () => {
    expect(evaluateCellRule({ operator: "==", value: "active" }, "active")).toBe(true);
    expect(evaluateCellRule({ operator: "==", value: "active" }, "inactive")).toBe(false);
  });

  it("evaluates contains condition", () => {
    expect(evaluateCellRule({ operator: "contains", value: "err" }, "Error occurred")).toBe(true);
    expect(evaluateCellRule({ operator: "contains", value: "err" }, "Success")).toBe(false);
  });

  it("contains is case-insensitive", () => {
    expect(evaluateCellRule({ operator: "contains", value: "ERR" }, "error")).toBe(true);
  });

  it("returns false for null/undefined values", () => {
    expect(evaluateCellRule({ operator: ">", value: 50 }, null)).toBe(false);
    expect(evaluateCellRule({ operator: "==", value: "x" }, undefined)).toBe(false);
  });
});

describe("resolveCellStyle", () => {
  const rules: CellFormattingRule[] = [
    { operator: ">", value: 80, style: { backgroundColor: "#c6efce", fontWeight: "bold" } },
    { operator: "<", value: 20, style: { backgroundColor: "#ffc7ce", color: "#9c0006" } },
  ];

  it("returns matching rule style", () => {
    const style = resolveCellStyle(rules, 90);
    expect(style).toEqual({ backgroundColor: "#c6efce", fontWeight: "bold" });
  });

  it("returns first matching rule when multiple match", () => {
    const style = resolveCellStyle(rules, 10);
    expect(style).toEqual({ backgroundColor: "#ffc7ce", color: "#9c0006" });
  });

  it("returns undefined when no rule matches", () => {
    expect(resolveCellStyle(rules, 50)).toBeUndefined();
  });

  it("returns undefined for empty rules", () => {
    expect(resolveCellStyle([], 50)).toBeUndefined();
  });
});
