export type StylingOperator =
  | "<=" | ">=" | "<" | ">" | "==" | "!="
  | "between"
  | "contains" | "not_contains" | "starts_with" | "ends_with"
  | "is_null" | "is_not_null";

export interface StylingRule {
  id: string;
  operator: StylingOperator;
  value: number | string;
  /** Upper bound for the "between" operator (inclusive) */
  valueTo?: number | string;
  /** When set, compare against $param_{parameterRef} instead of static value */
  parameterRef?: string;
  /** When set, resolve upper bound from parameter instead of static valueTo */
  parameterRefTo?: string;
  color: string;
  target?: "color" | "backgroundColor" | "textColor";
}

export interface StylingConfig {
  enabled: boolean;
  rules: StylingRule[];
  /** For tables: which column to evaluate rules against */
  targetColumn?: string;
}

const NUMERIC_OPS = new Set(["<=", ">=", "<", ">", "==", "!="]);
const STRING_OPS = new Set(["contains", "not_contains", "starts_with", "ends_with"]);
const NULL_OPS = new Set(["is_null", "is_not_null"]);

function evaluateNumeric(op: string, left: number, right: number): boolean {
  switch (op) {
    case "<=": return left <= right;
    case ">=": return left >= right;
    case "<":  return left < right;
    case ">":  return left > right;
    case "==": return left === right;
    case "!=": return left !== right;
    default:   return false;
  }
}

function evaluateString(op: string, left: string, right: string): boolean {
  const l = left.toLowerCase();
  const r = right.toLowerCase();
  switch (op) {
    case "contains":     return l.includes(r);
    case "not_contains": return !l.includes(r);
    case "starts_with":  return l.startsWith(r);
    case "ends_with":    return l.endsWith(r);
    case "==":           return l === r;
    case "!=":           return l !== r;
    default:             return false;
  }
}

function isNullish(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * Evaluate styling rules in order and return the color of the first matching rule.
 * When a rule has `parameterRef`, the comparison value is resolved from `resolvedParamValues`.
 */
export function resolveStylingRuleColor(
  cellValue: unknown,
  rules: StylingRule[],
  resolvedParamValues?: Record<string, unknown>,
): string | undefined {
  for (const rule of rules) {
    const op = rule.operator;

    // Null checks — no compare value needed
    if (NULL_OPS.has(op)) {
      if (op === "is_null" && isNullish(cellValue)) return rule.color;
      if (op === "is_not_null" && !isNullish(cellValue)) return rule.color;
      continue;
    }

    // Between: needs two bounds, numeric only
    if (op === "between") {
      const numCell = Number(cellValue);
      if (Number.isNaN(numCell)) continue;

      let low: number;
      if (rule.parameterRef) {
        const raw = resolvedParamValues?.[rule.parameterRef];
        if (raw === undefined || raw === null) continue;
        low = Number(raw);
        if (Number.isNaN(low)) continue;
      } else {
        low = Number(rule.value);
        if (Number.isNaN(low)) continue;
      }

      let high: number;
      if (rule.parameterRefTo) {
        const raw = resolvedParamValues?.[rule.parameterRefTo];
        if (raw === undefined || raw === null) continue;
        high = Number(raw);
        if (Number.isNaN(high)) continue;
      } else {
        if (rule.valueTo === undefined || rule.valueTo === null) continue;
        high = Number(rule.valueTo);
        if (Number.isNaN(high)) continue;
      }

      if (numCell >= low && numCell <= high) return rule.color;
      continue;
    }

    // Resolve compare value
    let compareValue: unknown;
    if (rule.parameterRef) {
      const raw = resolvedParamValues?.[rule.parameterRef];
      if (raw === undefined || raw === null) continue;
      compareValue = raw;
    } else {
      compareValue = rule.value;
    }

    // String operators: coerce both to string
    if (STRING_OPS.has(op)) {
      if (cellValue == null) continue;
      const result = evaluateString(op, String(cellValue), String(compareValue));
      if (result) return rule.color;
      continue;
    }

    // Numeric operators: try numeric first, fall back to string for ==/!=
    if (NUMERIC_OPS.has(op)) {
      const numLeft = Number(cellValue);
      const numRight = Number(compareValue);

      if (!Number.isNaN(numLeft) && !Number.isNaN(numRight)) {
        if (evaluateNumeric(op, numLeft, numRight)) return rule.color;
        continue;
      }

      // For == and !=, fall back to string comparison when not both numeric
      if ((op === "==" || op === "!=") && cellValue != null) {
        if (evaluateString(op, String(cellValue), String(compareValue))) return rule.color;
      }
      continue;
    }
  }

  return undefined;
}
