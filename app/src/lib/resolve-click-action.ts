import type { DashboardWidget, ClickAction } from "./db/schema";

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
      value = point._clickedValue;
      effectiveSourceField = (point._clickedColumn as string) ?? "";
    } else {
      value = point[sourceField];
      effectiveSourceField = sourceField;
    }

    if (value === undefined) return null;
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
