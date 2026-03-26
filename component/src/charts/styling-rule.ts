export type StylingOperator =
  | "<="
  | ">="
  | "<"
  | ">"
  | "=="
  | "!="
  | "between"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "is_null"
  | "is_not_null";

export interface StylingRule {
  id: string;
  /** For tables: which column this rule evaluates against */
  column?: string;
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
  bold?: boolean;
}

export interface StylingConfig {
  enabled: boolean;
  rules: StylingRule[];
}

// ---------------------------------------------------------------------------
// Color scale config
// ---------------------------------------------------------------------------

export interface ColorScaleConfig {
  column: string;
  minColor: string;
  maxColor: string;
}

// ---------------------------------------------------------------------------
// Operator registry — single source of truth for all styling operators.
// Consumed by both the evaluation engine and the editor UI.
// ---------------------------------------------------------------------------

export type OperatorGroup = "Numeric" | "Text" | "Null";

export interface OperatorDef {
  value: StylingOperator;
  label: string;
  group: OperatorGroup;
}

export const OPERATOR_REGISTRY: OperatorDef[] = [
  // Numeric
  { value: "<=", label: "<= (less or equal)", group: "Numeric" },
  { value: ">=", label: ">= (greater or equal)", group: "Numeric" },
  { value: "<", label: "< (less than)", group: "Numeric" },
  { value: ">", label: "> (greater than)", group: "Numeric" },
  { value: "==", label: "== (equals)", group: "Numeric" },
  { value: "!=", label: "!= (not equal)", group: "Numeric" },
  { value: "between", label: "between", group: "Numeric" },
  // Text
  { value: "contains", label: "contains", group: "Text" },
  { value: "not_contains", label: "not contains", group: "Text" },
  { value: "starts_with", label: "starts with", group: "Text" },
  { value: "ends_with", label: "ends with", group: "Text" },
  // Null
  { value: "is_null", label: "is null", group: "Null" },
  { value: "is_not_null", label: "is not null", group: "Null" },
];

/** Grouped operators for the editor UI dropdown. */
export function getOperatorGroups(): {
  label: string;
  operators: OperatorDef[];
}[] {
  const groups = new Map<string, OperatorDef[]>();
  for (const op of OPERATOR_REGISTRY) {
    if (!groups.has(op.group)) groups.set(op.group, []);
    groups.get(op.group)!.push(op);
  }
  return Array.from(groups.entries()).map(([label, operators]) => ({
    label,
    operators,
  }));
}

const NUMERIC_OPS = new Set(
  OPERATOR_REGISTRY.filter((o) => o.group === "Numeric").map((o) => o.value),
);
const STRING_OPS = new Set(
  OPERATOR_REGISTRY.filter((o) => o.group === "Text").map((o) => o.value),
);
const NULL_OPS = new Set(
  OPERATOR_REGISTRY.filter((o) => o.group === "Null").map((o) => o.value),
);

function evaluateNumeric(op: string, left: number, right: number): boolean {
  switch (op) {
    case "<=":
      return left <= right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case ">":
      return left > right;
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    default:
      return false;
  }
}

function evaluateString(op: string, left: string, right: string): boolean {
  const l = left.toLowerCase();
  const r = right.toLowerCase();
  switch (op) {
    case "contains":
      return l.includes(r);
    case "not_contains":
      return !l.includes(r);
    case "starts_with":
      return l.startsWith(r);
    case "ends_with":
      return l.endsWith(r);
    case "==":
      return l === r;
    case "!=":
      return l !== r;
    default:
      return false;
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
      const result = evaluateString(
        op,
        String(cellValue),
        String(compareValue),
      );
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
        if (evaluateString(op, String(cellValue), String(compareValue)))
          return rule.color;
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
  if (min === max)
    return minColor.length === 4 ? toHex(...parseHex(minColor)) : minColor;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const [r1, g1, b1] = parseHex(minColor);
  const [r2, g2, b2] = parseHex(maxColor);
  return toHex(r1 + t * (r2 - r1), g1 + t * (g2 - g1), b1 + t * (b2 - b1));
}
