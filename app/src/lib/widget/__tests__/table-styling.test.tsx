import { describe, it, expect } from "vitest";
import type { StylingRule } from "@neoboard/components";
import {
  resolveStylingRuleRowStyle,
  resolveStylingRuleCellStyle,
} from "../table-styling";

function rule(partial: Partial<StylingRule>): StylingRule {
  return {
    id: "r1",
    operator: ">",
    value: 100,
    color: "#22c55e",
    column: "total",
    ...partial,
  };
}

/**
 * A rule that names a column paints that column's cell; a rule that names none
 * paints the row. Every case below that passes a column-scoped rule to the ROW
 * resolver expects nothing back — that is the #1418 bug: the column selected
 * which value was *tested* and never which cell was *painted*.
 */
describe("resolveStylingRuleCellStyle — a rule scoped to one column", () => {
  const row = { product: "Ultra Widget", total: 150 };

  it('applies text color for target "color" (seed/other-chart spelling) — #1057', () => {
    const style = resolveStylingRuleCellStyle(
      [rule({ target: "color", color: "#22c55e" })],
      row,
      "total",
    );
    expect(style).toEqual({ color: "#22c55e" });
  });

  it('applies text color for target "textColor" (table editor spelling)', () => {
    const style = resolveStylingRuleCellStyle(
      [rule({ target: "textColor", color: "#ef4444" })],
      row,
      "total",
    );
    expect(style).toEqual({ color: "#ef4444" });
  });

  it('applies background for target "backgroundColor"', () => {
    const style = resolveStylingRuleCellStyle(
      [rule({ target: "backgroundColor", color: "#000000" })],
      row,
      "total",
    );
    expect(style?.backgroundColor).toBe("#000000");
  });

  it("applies bold alongside color", () => {
    const style = resolveStylingRuleCellStyle(
      [rule({ target: "color", color: "#22c55e", bold: true })],
      row,
      "total",
    );
    expect(style).toMatchObject({ color: "#22c55e", fontWeight: "bold" });
  });

  it("leaves every other column alone", () => {
    // The whole of #1418: a rule on `total` turned the product name green too.
    const rules = [rule({ target: "color", color: "#22c55e", bold: true })];
    expect(resolveStylingRuleCellStyle(rules, row, "product")).toBeUndefined();
    expect(resolveStylingRuleRowStyle(rules, row, undefined)).toBeUndefined();
  });

  it("lets two rules on two columns both take effect", () => {
    // Merged into one row-level object, the later rule's `color` silently
    // overwrote the earlier one's and only one of them was ever visible.
    const rules = [
      rule({ id: "a", column: "total", target: "color", color: "#22c55e" }),
      rule({
        id: "b",
        column: "product",
        operator: "contains",
        value: "Ultra",
        target: "color",
        color: "#6366f1",
      }),
    ];
    expect(resolveStylingRuleCellStyle(rules, row, "total")?.color).toBe(
      "#22c55e",
    );
    expect(resolveStylingRuleCellStyle(rules, row, "product")?.color).toBe(
      "#6366f1",
    );
  });

  it("gives the last matching rule on one cell the final say", () => {
    const style = resolveStylingRuleCellStyle(
      [
        rule({ id: "a", target: "color", color: "#22c55e" }),
        rule({ id: "b", target: "color", color: "#ef4444" }),
      ],
      row,
      "total",
    );
    expect(style?.color).toBe("#ef4444");
  });

  it('does not auto-override an explicit "color" text rule with contrast color', () => {
    const style = resolveStylingRuleCellStyle(
      [
        rule({ target: "backgroundColor", color: "#000000" }),
        rule({ id: "r2", target: "color", color: "#22c55e" }),
      ],
      row,
      "total",
    );
    expect(style?.color).toBe("#22c55e");
    expect(style?.backgroundColor).toBe("#000000");
  });

  it("auto-fills a contrast text color when only a background rule matched", () => {
    const style = resolveStylingRuleCellStyle(
      [rule({ target: "backgroundColor", color: "#000000" })],
      row,
      "total",
    );
    expect(style?.backgroundColor).toBe("#000000");
    expect(style?.color).toBeTruthy();
  });

  it("still fills contrast when a text rule exists but did not match", () => {
    // The guard asked whether a text rule was present, not whether one had
    // matched — so a non-matching text rule left the cell with inherited dark
    // text on a black background.
    const style = resolveStylingRuleCellStyle(
      [
        rule({ target: "backgroundColor", color: "#000000" }),
        rule({ id: "never", target: "color", value: 10_000 }),
      ],
      row,
      "total",
    );
    expect(style?.backgroundColor).toBe("#000000");
    expect(style?.color).toBeTruthy();
  });

  it("does not let a text rule on another column suppress contrast here", () => {
    const style = resolveStylingRuleCellStyle(
      [
        rule({ target: "backgroundColor", color: "#000000" }),
        rule({
          id: "elsewhere",
          column: "product",
          operator: "contains",
          value: "Ultra",
          target: "color",
          color: "#6366f1",
        }),
      ],
      row,
      "total",
    );
    expect(style?.color).toBeTruthy();
  });

  it("returns undefined when no rule matches", () => {
    const style = resolveStylingRuleCellStyle(
      [rule({ target: "color", value: 1000 })], // 150 is not > 1000
      row,
      "total",
    );
    expect(style).toBeUndefined();
  });
});

describe("resolveStylingRuleRowStyle — a rule that names no column", () => {
  it("still paints the whole row, testing the fallback column", () => {
    const style = resolveStylingRuleRowStyle(
      [rule({ column: undefined, target: "color", color: "#22c55e" })],
      { amount: 150 },
      "amount",
    );
    expect(style).toEqual({ color: "#22c55e" });
  });

  it("ignores column-scoped rules entirely", () => {
    const style = resolveStylingRuleRowStyle(
      [rule({ column: "total", target: "color" })],
      { total: 150 },
      "total",
    );
    expect(style).toBeUndefined();
  });

  it("returns undefined with no fallback column to test", () => {
    const style = resolveStylingRuleRowStyle(
      [rule({ column: undefined, target: "color" })],
      { total: 150 },
      undefined,
    );
    expect(style).toBeUndefined();
  });
});
