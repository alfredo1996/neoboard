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

// ---------------------------------------------------------------------------
// Cell-level conditional formatting
// ---------------------------------------------------------------------------

export interface CellFormatStyle {
  backgroundColor?: string;
  textColor?: string;
  bold?: boolean;
  /** Lucide icon name displayed as a badge (e.g. "check", "x", "alert-triangle") */
  icon?: string;
}

export interface CellFormatRule {
  id: string;
  /** Column this rule applies to */
  column: string;
  operator: StylingOperator;
  value: number | string;
  valueTo?: number | string;
  style: CellFormatStyle;
}

export interface ColorScaleConfig {
  column: string;
  minColor: string;
  maxColor: string;
}

export interface ConditionalFormatConfig {
  rules: CellFormatRule[];
  colorScales: ColorScaleConfig[];
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

// ---------------------------------------------------------------------------
// Cell-level conditional formatting
// ---------------------------------------------------------------------------

/**
 * Evaluate cell format rules for a specific cell. Only rules matching `columnId`
 * are considered. Returns the style of the first matching rule, or undefined.
 */
export function resolveCellFormat(
  cellValue: unknown,
  columnId: string,
  rules: CellFormatRule[],
): CellFormatStyle | undefined {
  for (const rule of rules) {
    if (rule.column !== columnId) continue;
    const op = rule.operator;

    // Null checks
    if (NULL_OPS.has(op)) {
      if (op === "is_null" && isNullish(cellValue)) return rule.style;
      if (op === "is_not_null" && !isNullish(cellValue)) return rule.style;
      continue;
    }

    // Between
    if (op === "between") {
      const numCell = Number(cellValue);
      if (Number.isNaN(numCell)) continue;
      const low = Number(rule.value);
      if (Number.isNaN(low)) continue;
      if (rule.valueTo === undefined || rule.valueTo === null) continue;
      const high = Number(rule.valueTo);
      if (Number.isNaN(high)) continue;
      if (numCell >= low && numCell <= high) return rule.style;
      continue;
    }

    const compareValue = rule.value;

    // String operators
    if (STRING_OPS.has(op)) {
      if (cellValue == null) continue;
      if (evaluateString(op, String(cellValue), String(compareValue))) return rule.style;
      continue;
    }

    // Numeric operators
    if (NUMERIC_OPS.has(op)) {
      const numLeft = Number(cellValue);
      const numRight = Number(compareValue);

      if (!Number.isNaN(numLeft) && !Number.isNaN(numRight)) {
        if (evaluateNumeric(op, numLeft, numRight)) return rule.style;
        continue;
      }

      if ((op === "==" || op === "!=") && cellValue != null) {
        if (evaluateString(op, String(cellValue), String(compareValue))) return rule.style;
      }
      continue;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Color scale (gradient interpolation)
// ---------------------------------------------------------------------------

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  // Expand 3-char shorthand: #f00 → ff0000
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    clamp(r).toString(16).padStart(2, "0") +
    clamp(g).toString(16).padStart(2, "0") +
    clamp(b).toString(16).padStart(2, "0")
  );
}

/**
 * Linearly interpolate between two hex colors based on a value's position
 * within [min, max]. Values outside the range are clamped.
 */
export function interpolateColor(
  value: number,
  min: number,
  max: number,
  minColor: string,
  maxColor: string,
): string {
  if (min === max) return minColor.length === 4 ? toHex(...parseHex(minColor)) : minColor;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const [r1, g1, b1] = parseHex(minColor);
  const [r2, g2, b2] = parseHex(maxColor);
  return toHex(
    r1 + t * (r2 - r1),
    g1 + t * (g2 - g1),
    b1 + t * (b2 - b1),
  );
}
