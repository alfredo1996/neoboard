import type {
  ClickAction,
  ClickActionRule,
  StylingConfig,
  StylingRule,
  DashboardLayoutV2,
} from "@/lib/db/schema";
import {
  chartSupportsClickAction,
  chartSupportsStyling,
} from "@/lib/chart-registry";

/**
 * Build a ClickAction config from editor state.
 * Pure function extracted from widget-editor-modal.tsx.
 */
export function buildClickActionConfig(opts: {
  clickActionEnabled: boolean;
  clickActionType: ClickAction["type"];
  parameterName: string;
  sourceField: string;
  chartType: string;
  targetPageId: string;
  layout?: DashboardLayoutV2;
  clickableColumns?: string[];
  actionRules?: ClickActionRule[];
}): ClickAction | undefined {
  const {
    clickActionEnabled,
    clickActionType,
    parameterName,
    sourceField,
    chartType,
    targetPageId,
    layout,
    clickableColumns = [],
    actionRules = [],
  } = opts;

  if (!clickActionEnabled || !chartSupportsClickAction(chartType))
    return undefined;

  const needsParam =
    clickActionType === "set-parameter" ||
    clickActionType === "set-parameter-and-navigate";
  const needsPage =
    clickActionType === "navigate-to-page" ||
    clickActionType === "set-parameter-and-navigate";

  const trimmedParamName = parameterName.trim();
  const trimmedSourceField = sourceField.trim();
  const trimmedTargetPageId = targetPageId.trim();

  if (needsParam && !trimmedParamName) return undefined;

  const resolvedSourceField = chartType === "table" ? "" : trimmedSourceField;

  if (needsParam && chartType !== "table" && !resolvedSourceField)
    return undefined;

  if (needsPage && !trimmedTargetPageId) return undefined;

  if (needsPage && layout) {
    const validPageIds = new Set((layout.pages ?? []).map((p) => p.id));
    if (!validPageIds.has(trimmedTargetPageId)) return undefined;
  }

  return {
    type: actionRules.length > 0 ? actionRules[0].type : clickActionType,
    ...(needsParam && actionRules.length === 0
      ? {
          parameterMapping: {
            parameterName: trimmedParamName,
            sourceField: resolvedSourceField,
          },
        }
      : {}),
    ...(needsPage && actionRules.length === 0
      ? { targetPageId: trimmedTargetPageId }
      : {}),
    ...(chartType === "table" &&
    clickableColumns.length > 0 &&
    actionRules.length === 0
      ? { clickableColumns }
      : {}),
    ...(actionRules.length > 0 ? { rules: actionRules } : {}),
  };
}

/**
 * Build a StylingConfig from editor state.
 */
export function buildStylingConfigFromEditor(opts: {
  stylingEnabled: boolean;
  chartType: string;
  stylingRules: StylingRule[];
}): StylingConfig | undefined {
  if (!opts.stylingEnabled || !chartSupportsStyling(opts.chartType))
    return undefined;
  if (opts.stylingRules.length === 0) return undefined;
  return { enabled: true, rules: opts.stylingRules };
}

/** Content-only widget types that don't produce data */
const CONTENT_ONLY_TYPES = new Set([
  "markdown",
  "iframe",
  "form",
  "parameter-select",
]);

/**
 * Check if a widget type is data-producing (not content-only).
 */
export function isDataWidget(chartType: string): boolean {
  return !CONTENT_ONLY_TYPES.has(chartType);
}
