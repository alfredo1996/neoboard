"use client";

import { useCallback } from "react";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import type { DashboardWidget, DashboardLayoutV2 } from "@/lib/db/schema";
import { resolveInternalParamType } from "./parameter-config-section";
import { normalizeParamName } from "@/lib/parameter/normalize-param-name";

/**
 * Builds a DashboardWidget object from the current widget editor store state.
 * Encapsulates the settings construction logic shared by all save paths.
 */
export function useBuildWidgetForSave(
  existingWidget: DashboardWidget | undefined,
  layout?: DashboardLayoutV2,
): () => DashboardWidget {
  const chartType = useWidgetEditorStore((s) => s.chartType);
  const connectionId = useWidgetEditorStore((s) => s.connectionId);
  const query = useWidgetEditorStore((s) => s.query);
  const title = useWidgetEditorStore((s) => s.title);
  const chartOptions = useWidgetEditorStore((s) => s.chartOptions);
  const formFields = useWidgetEditorStore((s) => s.formFields);
  const transforms = useWidgetEditorStore((s) => s.transforms);
  const transformsEnabled = useWidgetEditorStore((s) => s.transformsEnabled);
  const enableCache = useWidgetEditorStore((s) => s.enableCache);
  const cacheTtlMinutes = useWidgetEditorStore((s) => s.cacheTtlMinutes);
  const colorScales = useWidgetEditorStore((s) => s.colorScales);
  const refreshWidgetIds = useWidgetEditorStore((s) => s.refreshWidgetIds);
  const paramUIType = useWidgetEditorStore((s) => s.paramUIType);
  const dateSub = useWidgetEditorStore((s) => s.dateSub);
  const multiSelect = useWidgetEditorStore((s) => s.multiSelect);
  const paramWidgetName = useWidgetEditorStore((s) => s.paramWidgetName);
  const database = useWidgetEditorStore((s) => s.database);
  const allowWrites = useWidgetEditorStore((s) => s.allowWrites);
  const templateId = useWidgetEditorStore((s) => s.templateId);
  const templateSyncedAt = useWidgetEditorStore((s) => s.templateSyncedAt);
  const buildClickAction = useWidgetEditorStore((s) => s.buildClickAction);
  const buildStylingConfig = useWidgetEditorStore((s) => s.buildStylingConfig);
  const addToQueryHistory = useWidgetEditorStore((s) => s.addToQueryHistory);

  return useCallback(() => {
    const isParamSelect = chartType === "parameter-select";
    const isForm = chartType === "form";
    const isContentOnly = chartType === "markdown" || chartType === "iframe";

    // Record query in history
    if (query.trim() && !isParamSelect && !isContentOnly) {
      addToQueryHistory(query);
    }

    const clickAction = buildClickAction(layout);
    const stylingConfig = buildStylingConfig();
    const updatedHistory = useWidgetEditorStore.getState().queryHistory;

    const resolvedChartOptions = isParamSelect
      ? {
          ...chartOptions,
          parameterType: resolveInternalParamType(
            paramUIType,
            dateSub,
            multiSelect,
          ),
          // Strip a leading param_ so the consumed token isn't doubled (#1055).
          parameterName: normalizeParamName(paramWidgetName),
          // Seed query is only meaningful for the option-backed types.
          seedQuery:
            paramUIType === "select" || paramUIType === "cascading"
              ? (chartOptions.seedQuery ?? "")
              : undefined,
        }
      : isForm
        ? {
            ...chartOptions,
            refreshWidgetIds:
              refreshWidgetIds.length > 0 ? refreshWidgetIds : undefined,
          }
        : chartOptions;

    const skipSettings = isParamSelect || isForm || isContentOnly;

    return {
      id: existingWidget?.id ?? crypto.randomUUID(),
      chartType,
      connectionId:
        // Option-backed parameter types (select, cascading) need a connection
        // to run the seed query. Date/freetext/number-range have no DB query.
        (isParamSelect &&
          paramUIType !== "select" &&
          paramUIType !== "cascading") ||
        isContentOnly
          ? ""
          : connectionId,
      query: isParamSelect || isContentOnly ? "" : query,
      params: existingWidget?.params,
      database: isContentOnly ? undefined : database || undefined,
      allowWrites: isContentOnly ? undefined : allowWrites || undefined,
      settings: {
        ...(existingWidget?.settings ?? {}),
        title: title || undefined,
        chartOptions: resolvedChartOptions,
        formFields: isForm ? formFields : undefined,
        clickAction: skipSettings ? undefined : clickAction,
        stylingConfig: skipSettings ? undefined : stylingConfig,
        conditionalFormatting: skipSettings
          ? undefined
          : colorScales.length
            ? { colorScales }
            : undefined,
        enableCache: skipSettings ? undefined : enableCache,
        cacheTtlMinutes: skipSettings ? undefined : cacheTtlMinutes,
        transforms: skipSettings
          ? undefined
          : transforms.length
            ? transforms
            : undefined,
        transformsEnabled: skipSettings ? undefined : transformsEnabled,
        queryHistory:
          isParamSelect || isContentOnly
            ? undefined
            : updatedHistory.length
              ? updatedHistory
              : undefined,
      },
      templateId,
      templateSyncedAt,
    };
  }, [
    existingWidget,
    layout,
    chartType,
    connectionId,
    database,
    allowWrites,
    query,
    title,
    chartOptions,
    formFields,
    transforms,
    transformsEnabled,
    enableCache,
    cacheTtlMinutes,
    colorScales,
    refreshWidgetIds,
    paramUIType,
    dateSub,
    multiSelect,
    paramWidgetName,
    templateId,
    templateSyncedAt,
    buildClickAction,
    buildStylingConfig,
    addToQueryHistory,
  ]);
}
