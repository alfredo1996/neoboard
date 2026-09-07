import type { CSSProperties } from "react";
import {
  resolveStylingRuleColor,
  contrastTextColor,
  type StylingRule,
} from "@neoboard/components";

/**
 * Canonical text-color target values. Conditional-styling rules historically
 * use two spellings for "colour the text": chart plugins (single-value, pie,
 * line, …), the seed data, and dashboard import/migration all emit `"color"`,
 * while the table plugin's own editor emits `"textColor"`. Both mean the same
 * thing — treat them as equivalent so table rules authored anywhere apply. (#1057)
 */
const TEXT_COLOR_TARGETS = new Set(["textColor", "color"]);

function isTextColorTarget(target: string | undefined): boolean {
  return target !== undefined && TEXT_COLOR_TARGETS.has(target);
}

/**
 * Build one inline style from a set of rules, each tested against `testCol`.
 *
 * Rules are applied in order and the last match wins, so two rules setting the
 * same property on the same scope resolve predictably rather than by array
 * position alone. When a background is set and none of THESE rules set a text
 * colour, the text colour is chosen for contrast.
 */
function buildStyle(
  rules: StylingRule[],
  row: Record<string, unknown>,
  testCol: (rule: StylingRule) => string | undefined,
  paramValues?: Record<string, unknown>,
): CSSProperties | undefined {
  const style: CSSProperties = {};
  let hasStyle = false;

  for (const rule of rules) {
    const col = testCol(rule);
    if (!col || !(col in row)) continue;
    const color = resolveStylingRuleColor(row[col], [rule], paramValues);
    if (!color) continue;
    const target = rule.target || "backgroundColor";
    if (target === "backgroundColor") {
      style.backgroundColor = color;
      hasStyle = true;
    }
    if (isTextColorTarget(target)) {
      style.color = color;
      hasStyle = true;
    }
    if (rule.bold) {
      style.fontWeight = "bold";
      hasStyle = true;
    }
  }

  // Whether a text colour was actually SET, not whether a text rule exists:
  // a text rule that did not match used to suppress the fill and leave the
  // cell with inherited dark text on a dark background.
  if (style.backgroundColor && !style.color) {
    style.color = contrastTextColor(style.backgroundColor as string);
  }

  return hasStyle ? style : undefined;
}

/**
 * The inline style for one table CELL, from the rules scoped to its column.
 *
 * A rule's `column` used to select which value was *tested* and never which
 * cell was *painted*, so a rule on `margin` turned the product name and the
 * price green too — and because every rule merged into one row-level object,
 * two rules targeting the same property silently overwrote each other (#1418).
 */
export function resolveStylingRuleCellStyle(
  rules: StylingRule[],
  row: Record<string, unknown>,
  columnId: string,
  paramValues?: Record<string, unknown>,
): CSSProperties | undefined {
  return buildStyle(
    rules,
    row,
    (rule) => (rule.column === columnId ? columnId : undefined),
    paramValues,
  );
}

/**
 * The inline style for a whole table ROW, from the rules that name no column.
 *
 * An unscoped rule is tested against `defaultCol` — the widget's threshold
 * column, or the first numeric column — and paints the entire row, which is
 * what an unscoped rule has always meant.
 */
export function resolveStylingRuleRowStyle(
  rules: StylingRule[],
  row: Record<string, unknown>,
  defaultCol: string | undefined,
  paramValues?: Record<string, unknown>,
): CSSProperties | undefined {
  return buildStyle(
    rules,
    row,
    (rule) => (rule.column ? undefined : defaultCol),
    paramValues,
  );
}
