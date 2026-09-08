import { describe, it, expect } from "vitest";
import { resolveStylingRuleColor } from "../styling-rule";
import type { StylingRule } from "../styling-rule";

function rule(overrides: Partial<StylingRule> = {}): StylingRule {
  return {
    id: "r1",
    operator: "<=",
    value: 50,
    color: "#green",
    ...overrides,
  };
}

describe("resolveStylingRuleColor", () => {
  it("returns undefined for empty rules", () => {
    expect(resolveStylingRuleColor(42, [])).toBeUndefined();
  });

  describe("operators", () => {
    it("<= matches when value is less than or equal", () => {
      const rules = [rule({ operator: "<=", value: 50, color: "#a" })];
      expect(resolveStylingRuleColor(50, rules)).toBe("#a");
      expect(resolveStylingRuleColor(49, rules)).toBe("#a");
      expect(resolveStylingRuleColor(51, rules)).toBeUndefined();
    });

    it(">= matches when value is greater than or equal", () => {
      const rules = [rule({ operator: ">=", value: 50, color: "#b" })];
      expect(resolveStylingRuleColor(50, rules)).toBe("#b");
      expect(resolveStylingRuleColor(51, rules)).toBe("#b");
      expect(resolveStylingRuleColor(49, rules)).toBeUndefined();
    });

    it("< matches when value is strictly less", () => {
      const rules = [rule({ operator: "<", value: 50, color: "#c" })];
      expect(resolveStylingRuleColor(49, rules)).toBe("#c");
      expect(resolveStylingRuleColor(50, rules)).toBeUndefined();
    });

    it("> matches when value is strictly greater", () => {
      const rules = [rule({ operator: ">", value: 50, color: "#d" })];
      expect(resolveStylingRuleColor(51, rules)).toBe("#d");
      expect(resolveStylingRuleColor(50, rules)).toBeUndefined();
    });

    it("== matches when value equals", () => {
      const rules = [rule({ operator: "==", value: 50, color: "#e" })];
      expect(resolveStylingRuleColor(50, rules)).toBe("#e");
      expect(resolveStylingRuleColor(49, rules)).toBeUndefined();
    });

    it("!= matches when value does not equal", () => {
      const rules = [rule({ operator: "!=", value: 50, color: "#f" })];
      expect(resolveStylingRuleColor(49, rules)).toBe("#f");
      expect(resolveStylingRuleColor(50, rules)).toBeUndefined();
    });
  });

  it("first-match-wins: returns color of first matching rule", () => {
    const rules = [
      rule({ id: "a", operator: "<=", value: 10, color: "#red" }),
      rule({ id: "b", operator: "<=", value: 50, color: "#yellow" }),
      rule({ id: "c", operator: "<=", value: 100, color: "#green" }),
    ];
    expect(resolveStylingRuleColor(5, rules)).toBe("#red");
    expect(resolveStylingRuleColor(30, rules)).toBe("#yellow");
    expect(resolveStylingRuleColor(80, rules)).toBe("#green");
    expect(resolveStylingRuleColor(200, rules)).toBeUndefined();
  });

  it("returns undefined when NaN is compared", () => {
    const rules = [rule({ operator: "<=", value: 50, color: "#a" })];
    expect(resolveStylingRuleColor(NaN, rules)).toBeUndefined();
  });

  describe("parameterRef resolution", () => {
    it("uses resolved param value instead of static value", () => {
      const rules = [
        rule({
          operator: "<=",
          value: 999,
          parameterRef: "threshold",
          color: "#param",
        }),
      ];
      const params = { threshold: 50 };
      expect(resolveStylingRuleColor(30, rules, params)).toBe("#param");
      expect(resolveStylingRuleColor(60, rules, params)).toBeUndefined();
    });

    it("skips rule when parameterRef is set but param is missing", () => {
      const rules = [
        rule({
          operator: "<=",
          value: 999,
          parameterRef: "missing",
          color: "#param",
        }),
      ];
      expect(resolveStylingRuleColor(30, rules, {})).toBeUndefined();
    });

    it("coerces string param value to number for comparison", () => {
      const rules = [
        rule({ operator: "<=", parameterRef: "threshold", color: "#param" }),
      ];
      expect(resolveStylingRuleColor(30, rules, { threshold: "50" })).toBe(
        "#param",
      );
    });

    it("skips rule when param value is not a valid number", () => {
      const rules = [
        rule({ operator: "<=", parameterRef: "threshold", color: "#param" }),
      ];
      expect(
        resolveStylingRuleColor(30, rules, { threshold: "abc" }),
      ).toBeUndefined();
    });
  });

  describe("string operators", () => {
    it("contains: case-insensitive substring match", () => {
      const rules = [
        rule({ operator: "contains", value: "world", color: "#a" }),
      ];
      expect(resolveStylingRuleColor("Hello World", rules)).toBe("#a");
      expect(resolveStylingRuleColor("hello", rules)).toBeUndefined();
    });

    it("not_contains: true when substring is absent", () => {
      const rules = [
        rule({ operator: "not_contains", value: "xyz", color: "#a" }),
      ];
      expect(resolveStylingRuleColor("Hello", rules)).toBe("#a");
      expect(resolveStylingRuleColor("xyz stuff", rules)).toBeUndefined();
    });

    it("starts_with: case-insensitive prefix match", () => {
      const rules = [
        rule({ operator: "starts_with", value: "hel", color: "#a" }),
      ];
      expect(resolveStylingRuleColor("Hello", rules)).toBe("#a");
      expect(resolveStylingRuleColor("World", rules)).toBeUndefined();
    });

    it("ends_with: case-insensitive suffix match", () => {
      const rules = [rule({ operator: "ends_with", value: "LO", color: "#a" })];
      expect(resolveStylingRuleColor("Hello", rules)).toBe("#a");
      expect(resolveStylingRuleColor("Help", rules)).toBeUndefined();
    });

    it("== with string values: exact match (case-insensitive)", () => {
      const rules = [rule({ operator: "==", value: "active", color: "#a" })];
      expect(resolveStylingRuleColor("active", rules)).toBe("#a");
      expect(resolveStylingRuleColor("Active", rules)).toBe("#a");
      expect(resolveStylingRuleColor("inactive", rules)).toBeUndefined();
    });

    it("!= with string values", () => {
      const rules = [rule({ operator: "!=", value: "active", color: "#a" })];
      expect(resolveStylingRuleColor("inactive", rules)).toBe("#a");
      expect(resolveStylingRuleColor("active", rules)).toBeUndefined();
    });

    it("parameterRef works with string operators", () => {
      const rules = [
        rule({ operator: "contains", parameterRef: "search", color: "#a" }),
      ];
      expect(
        resolveStylingRuleColor("Hello World", rules, { search: "world" }),
      ).toBe("#a");
      expect(
        resolveStylingRuleColor("Hello", rules, { search: "xyz" }),
      ).toBeUndefined();
    });
  });

  describe("null operators", () => {
    it("is_null: matches null, undefined, and empty string", () => {
      const rules = [rule({ operator: "is_null", value: 0, color: "#a" })];
      expect(resolveStylingRuleColor(null, rules)).toBe("#a");
      expect(resolveStylingRuleColor(undefined, rules)).toBe("#a");
      expect(resolveStylingRuleColor("", rules)).toBe("#a");
    });

    it("is_null: does not match 0 or non-empty values", () => {
      const rules = [rule({ operator: "is_null", value: 0, color: "#a" })];
      expect(resolveStylingRuleColor(0, rules)).toBeUndefined();
      expect(resolveStylingRuleColor("value", rules)).toBeUndefined();
    });

    it("is_not_null: matches non-null, non-empty values", () => {
      const rules = [rule({ operator: "is_not_null", value: 0, color: "#a" })];
      expect(resolveStylingRuleColor("value", rules)).toBe("#a");
      expect(resolveStylingRuleColor(0, rules)).toBe("#a");
      expect(resolveStylingRuleColor(false, rules)).toBe("#a");
    });

    it("is_not_null: does not match null, undefined, empty string", () => {
      const rules = [rule({ operator: "is_not_null", value: 0, color: "#a" })];
      expect(resolveStylingRuleColor(null, rules)).toBeUndefined();
      expect(resolveStylingRuleColor(undefined, rules)).toBeUndefined();
      expect(resolveStylingRuleColor("", rules)).toBeUndefined();
    });
  });

  describe("between operator", () => {
    it("matches when value is within inclusive range", () => {
      const rules = [
        rule({ operator: "between", value: 10, valueTo: 50, color: "#a" }),
      ];
      expect(resolveStylingRuleColor(10, rules)).toBe("#a");
      expect(resolveStylingRuleColor(30, rules)).toBe("#a");
      expect(resolveStylingRuleColor(50, rules)).toBe("#a");
    });

    it("does not match when value is outside range", () => {
      const rules = [
        rule({ operator: "between", value: 10, valueTo: 50, color: "#a" }),
      ];
      expect(resolveStylingRuleColor(9, rules)).toBeUndefined();
      expect(resolveStylingRuleColor(51, rules)).toBeUndefined();
    });

    it("skips when valueTo is missing", () => {
      const rules = [rule({ operator: "between", value: 10, color: "#a" })];
      expect(resolveStylingRuleColor(30, rules)).toBeUndefined();
    });

    it("skips when cell value is NaN", () => {
      const rules = [
        rule({ operator: "between", value: 10, valueTo: 50, color: "#a" }),
      ];
      expect(resolveStylingRuleColor("abc", rules)).toBeUndefined();
    });

    it("works with parameterRef for lower bound", () => {
      const rules = [
        rule({
          operator: "between",
          parameterRef: "min",
          valueTo: 50,
          color: "#a",
        }),
      ];
      expect(resolveStylingRuleColor(30, rules, { min: 10 })).toBe("#a");
      expect(resolveStylingRuleColor(5, rules, { min: 10 })).toBeUndefined();
    });

    it("works with parameterRefTo for upper bound", () => {
      const rules = [
        rule({
          operator: "between",
          value: 10,
          parameterRefTo: "max",
          color: "#a",
        }),
      ];
      expect(resolveStylingRuleColor(30, rules, { max: 50 })).toBe("#a");
      expect(resolveStylingRuleColor(60, rules, { max: 50 })).toBeUndefined();
    });

    it("works with both parameterRef and parameterRefTo", () => {
      const rules = [
        rule({
          operator: "between",
          parameterRef: "min",
          parameterRefTo: "max",
          color: "#a",
        }),
      ];
      expect(resolveStylingRuleColor(30, rules, { min: 10, max: 50 })).toBe(
        "#a",
      );
      expect(
        resolveStylingRuleColor(60, rules, { min: 10, max: 50 }),
      ).toBeUndefined();
    });
  });

  describe("a null cell is absent, not zero (#1655)", () => {
    // `Number(null) === 0`, and the engine ran Number(cellValue) with no
    // guard. The shipped demo's own rule — `margin <= 0 -> red` — therefore
    // painted every product with a NULL cost the same red as a genuinely
    // loss-making one. Same for `rating < 70 -> red` on movie-highlights: an
    // unrated relationship read as a reviewer who gave it nothing.
    const rule = (over: Partial<StylingRule> = {}): StylingRule => ({
      id: "r",
      operator: "<=",
      value: 0,
      color: "#fee2e2",
      ...over,
    });

    it.each([
      ["<=", 0],
      ["<", 1],
      ["==", 0],
      [">=", 0],
    ])("does not match a null cell with %s %s", (operator, value) => {
      expect(
        resolveStylingRuleColor(null, [
          rule({ operator: operator as StylingRule["operator"], value }),
        ]),
      ).toBeUndefined();
    });

    it("still matches a genuine zero", () => {
      // The distinction the whole fix rests on: 0 is a value, null is not.
      expect(resolveStylingRuleColor(0, [rule()])).toBe("#fee2e2");
    });

    it("does not match an undefined or empty cell either", () => {
      expect(resolveStylingRuleColor(undefined, [rule()])).toBeUndefined();
      expect(resolveStylingRuleColor("", [rule()])).toBeUndefined();
    });

    it("does not match a null cell with between", () => {
      expect(
        resolveStylingRuleColor(null, [
          rule({ operator: "between", value: -10, valueTo: 10 }),
        ]),
      ).toBeUndefined();
    });

    it("still matches a genuine zero with between", () => {
      expect(
        resolveStylingRuleColor(0, [
          rule({ operator: "between", value: -10, valueTo: 10 }),
        ]),
      ).toBe("#fee2e2");
    });

    it("leaves is_null and is_not_null working", () => {
      expect(
        resolveStylingRuleColor(null, [
          rule({ operator: "is_null", color: "#ccc" }),
        ]),
      ).toBe("#ccc");
      expect(
        resolveStylingRuleColor(5, [
          rule({ operator: "is_not_null", color: "#0f0" }),
        ]),
      ).toBe("#0f0");
    });
  });

  describe("backward compatibility", () => {
    it("numeric ops still work with number inputs", () => {
      const rules = [rule({ operator: "<=", value: 50, color: "#a" })];
      expect(resolveStylingRuleColor(49, rules)).toBe("#a");
      expect(resolveStylingRuleColor(51, rules)).toBeUndefined();
    });

    it("NaN still returns undefined for numeric ops", () => {
      const rules = [rule({ operator: "<=", value: 50, color: "#a" })];
      expect(resolveStylingRuleColor(NaN, rules)).toBeUndefined();
    });
  });
});
