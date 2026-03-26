import type { CSSProperties } from "react";

export type CellOperator = ">" | "<" | "==" | "contains";

export interface CellFormattingRule {
  operator: CellOperator;
  value: string | number;
  style: CSSProperties;
}

/**
 * Evaluate a single cell formatting rule against a cell value.
 */
export function evaluateCellRule(
  rule: Pick<CellFormattingRule, "operator" | "value">,
  cellValue: unknown,
): boolean {
  if (cellValue === null || cellValue === undefined) return false;

  switch (rule.operator) {
    case ">":
      return typeof cellValue === "number" && cellValue > Number(rule.value);
    case "<":
      return typeof cellValue === "number" && cellValue < Number(rule.value);
    case "==":
      return String(cellValue) === String(rule.value);
    case "contains":
      return String(cellValue).toLowerCase().includes(String(rule.value).toLowerCase());
    default:
      return false;
  }
}

/**
 * Resolve the CSS style for a cell value by evaluating rules in order.
 * Returns the style of the first matching rule, or undefined if none match.
 */
export function resolveCellStyle(
  rules: CellFormattingRule[],
  cellValue: unknown,
): CSSProperties | undefined {
  for (const rule of rules) {
    if (evaluateCellRule(rule, cellValue)) {
      return rule.style;
    }
  }
  return undefined;
}
