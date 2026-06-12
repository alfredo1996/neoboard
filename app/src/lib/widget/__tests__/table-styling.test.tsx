import { describe, it, expect } from "vitest";
import type { StylingRule } from "@neoboard/components";
import { resolveStylingRuleRowStyle } from "../table-styling";

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

describe("resolveStylingRuleRowStyle", () => {
  const row = { total: 150 };

  it('applies text color for target "color" (seed/migrate/other-chart spelling) — #1057', () => {
    const style = resolveStylingRuleRowStyle(
      [rule({ target: "color", color: "#22c55e" })],
      row,
      undefined,
    );
    expect(style).toEqual({ color: "#22c55e" });
  });

  it('applies text color for target "textColor" (table editor spelling)', () => {
    const style = resolveStylingRuleRowStyle(
      [rule({ target: "textColor", color: "#ef4444" })],
      row,
      undefined,
    );
    expect(style).toEqual({ color: "#ef4444" });
  });

  it('applies background for target "backgroundColor"', () => {
    const style = resolveStylingRuleRowStyle(
      [rule({ target: "backgroundColor", color: "#000000" })],
      row,
      undefined,
    );
    expect(style?.backgroundColor).toBe("#000000");
  });

  it("applies bold alongside color", () => {
    const style = resolveStylingRuleRowStyle(
      [rule({ target: "color", color: "#22c55e", bold: true })],
      row,
      undefined,
    );
    expect(style).toMatchObject({ color: "#22c55e", fontWeight: "bold" });
  });

  it('does not auto-override an explicit "color" text rule with contrast color', () => {
    const style = resolveStylingRuleRowStyle(
      [
        rule({ target: "backgroundColor", color: "#000000" }),
        rule({ id: "r2", target: "color", color: "#22c55e" }),
      ],
      row,
      undefined,
    );
    // explicit text color wins; contrast auto-fill must not clobber it
    expect(style?.color).toBe("#22c55e");
    expect(style?.backgroundColor).toBe("#000000");
  });

  it("auto-fills a contrast text color when only a background rule matched", () => {
    const style = resolveStylingRuleRowStyle(
      [rule({ target: "backgroundColor", color: "#000000" })],
      row,
      undefined,
    );
    expect(style?.backgroundColor).toBe("#000000");
    expect(style?.color).toBeTruthy(); // contrast color filled in
  });

  it("returns undefined when no rule matches", () => {
    const style = resolveStylingRuleRowStyle(
      [rule({ target: "color", value: 1000 })], // 150 is not > 1000
      row,
      undefined,
    );
    expect(style).toBeUndefined();
  });

  it("falls back to defaultCol when a rule has no column", () => {
    const style = resolveStylingRuleRowStyle(
      [rule({ column: undefined, target: "color", color: "#22c55e" })],
      { amount: 150 },
      "amount",
    );
    expect(style).toEqual({ color: "#22c55e" });
  });
});
