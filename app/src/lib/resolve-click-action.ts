import type { DashboardWidget, ClickAction, ClickActionRule } from "./db/schema";

function isScalar(v: unknown): v is string | number | boolean | null {
  return v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

export interface ClickActionResult {
  setParameter?: {
    parameterName: string;
    value: unknown;
    label: string;
    sourceField: string;
  };
  navigateToPageId?: string;
}

/**
 * Resolves the click action for a widget given the clicked data point.
 * Returns null if no action should be taken (no action configured, missing data, etc.).
 */
export function resolveClickAction(
  widget: DashboardWidget,
  point: Record<string, unknown>,
): ClickActionResult | null {
  const clickAction = widget.settings?.clickAction as ClickAction | undefined;
  if (!clickAction) return null;

  const { type } = clickAction;
  const result: ClickActionResult = {};

  // Resolve parameter setting
  if (type === "set-parameter" || type === "set-parameter-and-navigate") {
    const mapping = clickAction.parameterMapping;
    if (!mapping) return null;
    const { parameterName, sourceField } = mapping;

    let value: unknown;
    let effectiveSourceField: string;

    // Cell-click: value comes directly from the clicked cell
    if ("_clickedValue" in point) {
      const clickedColumn = point._clickedColumn;
      if (typeof clickedColumn !== "string" || !clickedColumn.trim()) return null;
      // Validate clicked column against clickableColumns restriction
      const { clickableColumns } = clickAction;
      if (clickableColumns && clickableColumns.length > 0 && !clickableColumns.includes(clickedColumn)) {
        return null;
      }
      value = point._clickedValue;
      effectiveSourceField = clickedColumn;
    } else {
      value = point[sourceField];
      effectiveSourceField = sourceField;
    }

    if (value === undefined || !isScalar(value)) return null;
    const label =
      (widget.settings?.title as string) || widget.chartType;
    result.setParameter = { parameterName, value, label, sourceField: effectiveSourceField };
  }

  // Resolve page navigation
  if (type === "navigate-to-page" || type === "set-parameter-and-navigate") {
    const { targetPageId } = clickAction;
    if (!targetPageId) return null;
    result.navigateToPageId = targetPageId;
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Resolves a single ClickActionRule against the clicked data point.
 */
function resolveRuleAction(
  rule: ClickActionRule,
  point: Record<string, unknown>,
  widget: DashboardWidget,
): ClickActionResult | null {
  const { type } = rule;
  const result: ClickActionResult = {};

  if (type === "set-parameter" || type === "set-parameter-and-navigate") {
    const mapping = rule.parameterMapping;
    if (!mapping) return null;
    const { parameterName, sourceField } = mapping;

    let value: unknown;
    let effectiveSourceField: string;

    if ("_clickedValue" in point) {
      value = point._clickedValue;
      effectiveSourceField = (point._clickedColumn as string) || sourceField;
    } else {
      value = point[sourceField];
      effectiveSourceField = sourceField;
    }

    if (value === undefined || !isScalar(value)) return null;
    const label = (widget.settings?.title as string) || widget.chartType;
    result.setParameter = { parameterName, value, label, sourceField: effectiveSourceField };
  }

  if (type === "navigate-to-page" || type === "set-parameter-and-navigate") {
    const { targetPageId } = rule;
    if (!targetPageId) return null;
    result.navigateToPageId = targetPageId;
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Multi-rule resolution. Checks `rules[]` first, falls back to legacy single-rule behavior.
 */
export function resolveClickActions(
  widget: DashboardWidget,
  point: Record<string, unknown>,
): ClickActionResult | null {
  const clickAction = widget.settings?.clickAction as ClickAction | undefined;
  if (!clickAction) return null;

  const rules = clickAction.rules;
  if (!rules?.length) {
    return resolveClickAction(widget, point);
  }

  // For table cell clicks, match by triggerColumn
  if ("_clickedColumn" in point) {
    const clickedColumn = point._clickedColumn as string;
    const rule = rules.find((r) => r.triggerColumn === clickedColumn);
    if (!rule) return null;
    return resolveRuleAction(rule, point, widget);
  }

  // For chart clicks (bar/line/pie/graph/map), use the first rule
  return resolveRuleAction(rules[0], point, widget);
}

/**
 * Derives which table columns are clickable from action rules.
 * When rules exist, extracts triggerColumn values.
 * Falls back to legacy clickableColumns when no rules.
 */
export function deriveClickableColumns(clickAction: ClickAction | undefined): string[] | undefined {
  if (!clickAction) return undefined;
  if (!clickAction.rules?.length) return clickAction.clickableColumns;
  const cols = clickAction.rules
    .map((r) => r.triggerColumn)
    .filter((c): c is string => !!c);
  return cols.length > 0 ? cols : undefined;
}
