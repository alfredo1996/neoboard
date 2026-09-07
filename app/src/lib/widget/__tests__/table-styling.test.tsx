import { describe, it, expect } from "vitest";
import type { StylingRule } from "@neoboard/components";
import {
  resolveStylingRuleRowStyle,
  resolveStylingRuleCellStyle,
  makeCellStyleResolver,
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

describe("makeCellStyleResolver — rules and colour scales on one cell", () => {
  const row = { product: "Ultra Widget", total: 150 };
  const scaleOnTotal = (_r: Record<string, unknown>, col: string) =>
    col === "total"
      ? { backgroundColor: "#dbeafe", color: "#111111" }
      : undefined;

  it("returns the colour scale untouched when no rule names a column", () => {
    expect(makeCellStyleResolver([], scaleOnTotal)).toBe(scaleOnTotal);
    expect(makeCellStyleResolver(undefined, scaleOnTotal)).toBe(scaleOnTotal);
    expect(
      makeCellStyleResolver([rule({ column: undefined })], scaleOnTotal),
    ).toBe(scaleOnTotal);
  });

  it("returns undefined when there is neither a scoped rule nor a scale", () => {
    expect(makeCellStyleResolver(undefined, undefined)).toBeUndefined();
  });

  it("applies a scoped rule where no colour scale reaches", () => {
    const resolve = makeCellStyleResolver(
      [rule({ column: "total", target: "color", color: "#22c55e" })],
      undefined,
    );
    expect(resolve?.(row, "total")).toEqual({ color: "#22c55e" });
    expect(resolve?.(row, "product")).toBeUndefined();
  });

  it("lets the rule win over the scale where both land on one cell", () => {
    // A rule is an explicit instruction; a scale is a background gradient.
    const resolve = makeCellStyleResolver(
      [rule({ column: "total", target: "backgroundColor", color: "#000000" })],
      scaleOnTotal,
    );
    const style = resolve?.(row, "total");
    expect(style?.backgroundColor).toBe("#000000");
    // The contrast fill comes with the rule, so the scale's text colour goes.
    expect(style?.color).not.toBe("#111111");
  });

  it("keeps the scale on columns the rule does not name", () => {
    const resolve = makeCellStyleResolver(
      [
        rule({
          column: "product",
          operator: "contains",
          value: "Ultra",
          target: "color",
          color: "#6366f1",
        }),
      ],
      scaleOnTotal,
    );
    expect(resolve?.(row, "total")).toEqual({
      backgroundColor: "#dbeafe",
      color: "#111111",
    });
    expect(resolve?.(row, "product")?.color).toBe("#6366f1");
  });

  it("returns undefined for a cell neither reaches", () => {
    const resolve = makeCellStyleResolver(
      [rule({ column: "total", value: 10_000 })], // never matches
      scaleOnTotal,
    );
    expect(resolve?.(row, "product")).toBeUndefined();
  });
});
