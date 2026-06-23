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
 * Resolve the inline style for a table row from conditional-styling rules.
 *
 * Rules are evaluated in order; later matching rules override earlier ones.
 * When a background colour is set but no explicit text-colour rule matched, the
 * text colour is auto-chosen for contrast.
 */
export function resolveStylingRuleRowStyle(
  rules: StylingRule[],
  row: Record<string, unknown>,
  defaultCol: string | undefined,
  paramValues?: Record<string, unknown>,
): CSSProperties | undefined {
  const style: CSSProperties = {};
  let hasStyle = false;

  for (const rule of rules) {
    const ruleCol = rule.column || defaultCol;
    if (!ruleCol || !(ruleCol in row)) continue;
    const val = row[ruleCol];
    const color = resolveStylingRuleColor(val, [rule], paramValues);
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

  // Auto-set text colour for contrast when a background is set but no explicit
  // text-colour rule matched.
  if (
    style.backgroundColor &&
    !rules.some((r) => isTextColorTarget(r.target))
  ) {
    style.color = contrastTextColor(style.backgroundColor as string);
  }

  return hasStyle ? style : undefined;
}
