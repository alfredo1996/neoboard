import { useCallback } from "react";
import { useParameterStore } from "@/stores/parameter-store";
import {
  resolveClickActions,
  deriveClickableColumns,
} from "@/lib/widget/resolve-click-action";
import type { DashboardWidget, ClickAction } from "@/lib/db/schema";

/**
 * Extracts click-action handling from a widget configuration.
 *
 * Returns:
 * - `handleChartClick` — callback to pass to ChartRenderer's `onChartClick`
 * - `hasClickAction` — whether click actions are configured
 * - `clickableColumns` — for tables: which columns are interactive
 */
export function useClickAction(
  widget: DashboardWidget,
  onNavigateToPage?: (pageId: string, scrollToWidgetId?: string) => void,
) {
  const setParameter = useParameterStore((s) => s.setParameter);

  const handleChartClick = useCallback(
    (point: Record<string, unknown>) => {
      const result = resolveClickActions(widget, point);
      if (!result) return;

      if (result.setParameter) {
        const { parameterName, value, label, sourceField } =
          result.setParameter;
        setParameter(
          parameterName,
          value,
          label,
          sourceField,
          "text",
          "click-action",
          widget.id,
        );
      }

      if (result.navigateToPageId) {
        onNavigateToPage?.(result.navigateToPageId);
      }
    },
    [widget, setParameter, onNavigateToPage],
  );

  const ws = widget.settings ?? {};
  const clickAction = ws.clickAction as ClickAction | undefined;
  const hasClickAction = !!clickAction;
  const clickableColumns = deriveClickableColumns(clickAction);

  return { handleChartClick, hasClickAction, clickableColumns };
}
