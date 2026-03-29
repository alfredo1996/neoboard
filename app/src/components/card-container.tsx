"use client";

import { useWidgetQuery } from "@/hooks/use-widget-query";
import { resolveCacheOptions } from "@/lib/resolve-cache-options";
import { getChartConfig } from "@/lib/chart-registry";
import type { ColumnMapping } from "@/lib/chart-registry";
import type {
  DashboardWidget,
  ClickAction,
  StylingConfig,
} from "@/lib/db/schema";
import type { ParameterSourceMap } from "@/lib/collect-parameter-names";
import type { ColorScaleConfig } from "@neoboard/components";
import {
  useParameterStore,
  useParameterValues,
} from "@/stores/parameter-store";
import {
  resolveClickActions,
  deriveClickableColumns,
} from "@/lib/resolve-click-action";
import { scrollAndHighlight } from "@/lib/scroll-to-widget";
import { applyTransforms } from "@/lib/data-transforms";
import type { Transform } from "@/lib/data-transforms";
import { extractColumnNames, resolveStylingConfig } from "@/lib/card-utils";
import React, { useMemo, useCallback, useState } from "react";
import { AlertCircle, Play } from "lucide-react";
import {
  Skeleton,
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@neoboard/components";
import {
  EmptyState,
  ColumnMappingOverlay,
  substituteParams,
} from "@neoboard/components";
import { ChartRenderer } from "./chart-renderer";

/** Chart types that support column mapping. */
/** Derived from registry — chart types that support column mapping overlays. */
function supportsColumnMapping(type: string): boolean {
  return getChartConfig(type)?.supportsColumnMapping === true;
}

interface CardContainerProps {
  widget: DashboardWidget;
  /** When provided, renders the chart from this data without executing a query. */
  previewData?: unknown;
  /** resultId from the query execution — passed through to chart components
   *  that need to detect when the underlying data changed (e.g. graph widget). */
  previewResultId?: string;
  /**
   * When true, the column mapping overlay is rendered for supported chart types.
   * The overlay allows in-place axis reassignment without re-running the query.
   */
  isEditMode?: boolean;
  /**
   * Called when the user changes the column mapping via the overlay.
   * The caller is responsible for persisting the updated settings.
   */
  onWidgetSettingsChange?: (settings: Record<string, unknown>) => void;
  /** TanStack Query refetchInterval — periodically re-executes the widget query. */
  refetchInterval?: number | false;
  /** Called when a click action navigates to a different page. Optionally scrolls to a widget. */
  onNavigateToPage?: (pageId: string, scrollToWidgetId?: string) => void;
  /** When true, graph widgets trigger a fit-to-viewport after mount. */
  autoFit?: boolean;
  /** Maps parameter names to the widgets that set them (for clickable badges). */
  parameterSourceMap?: ParameterSourceMap;
}

// extractColumnNames imported from @/lib/card-utils

/**
 * Renders a parameter badge in the "Waiting for parameters" section.
 * When source widgets exist, shows a clickable badge with a popover listing
 * which widgets set that parameter and enabling navigation to them.
 */
function MissingParamBadge({
  name,
  parameterSourceMap,
  onNavigateToPage,
}: {
  name: string;
  parameterSourceMap?: ParameterSourceMap;
  onNavigateToPage?: (pageId: string, scrollToWidgetId?: string) => void;
}) {
  const sources = parameterSourceMap?.[name];

  if (!sources || sources.length === 0) {
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
        $param_{name}
      </code>
    );
  }

  function handleNavigateToWidget(pageId: string, widgetId: string) {
    // Try same-page scroll first
    if (scrollAndHighlight(widgetId)) return;
    // Cross-page navigation
    onNavigateToPage?.(pageId, widgetId);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground hover:bg-accent cursor-pointer transition-colors"
        >
          $param_{name}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="center">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Set by {sources.length} widget{sources.length !== 1 ? "s" : ""}
        </p>
        <ul className="space-y-1">
          {sources.map((source) => (
            <li key={`${source.pageId}-${source.widgetId}`}>
              <button
                type="button"
                className="w-full text-left rounded px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                onClick={() =>
                  handleNavigateToWidget(source.pageId, source.widgetId)
                }
              >
                <span className="font-medium">{source.widgetTitle}</span>
                <span className="text-muted-foreground text-xs ml-1">
                  ({source.pageTitle})
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * CardContainer: Fetches query results and renders the appropriate chart.
 * Uses React Query caching so queries are deduplicated across view->edit navigation.
 *
 * When `isEditMode` is true and the chart type is bar/line/pie, a lightweight
 * column mapping overlay is rendered at the bottom of the card, letting users
 * reassign axis columns without re-running the query.
 */
export function CardContainer({
  widget,
  previewData,
  previewResultId,
  isEditMode = false,
  onWidgetSettingsChange,
  refetchInterval,
  onNavigateToPage,
  autoFit,
  parameterSourceMap,
}: CardContainerProps) {
  const chartConfig = getChartConfig(widget.chartType);

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

  // Cache settings from widget config. Default: cache enabled, 5-min TTL.
  const enableCache = ws.enableCache !== false;
  const cacheTtlMinutes = (ws.cacheTtlMinutes as number | undefined) ?? 5;

  // Parameter-select, form, markdown, and iframe widgets are self-contained (no auto-query).
  const isParameterWidget = widget.chartType === "parameter-select";
  const isFormWidget = widget.chartType === "form";
  const isContentOnly =
    widget.chartType === "markdown" || widget.chartType === "iframe";

  const chartOptions = useMemo(
    () => (ws.chartOptions ?? {}) as Record<string, unknown>,
    [ws.chartOptions],
  );

  // Client-side transforms pipeline (applied post-query, pre-render)
  const transformsEnabled = widget.settings?.transformsEnabled !== false;
  const dataTransforms = useMemo(
    () =>
      transformsEnabled
        ? ((widget.settings?.transforms ?? []) as Transform[])
        : [],
    [widget.settings?.transforms, transformsEnabled],
  );

  const { staleTime, gcTime } = useMemo(
    () => resolveCacheOptions(chartOptions, enableCache, cacheTtlMinutes),
    [chartOptions, enableCache, cacheTtlMinutes],
  );

  // ── Manual Run mode ──────────────────────────────────────────────────────
  // When `manualRun` is enabled in chart options, the query starts disabled.
  // The user must click "Run Query" once. After that first run, parameter
  // changes automatically re-execute the query (different queryKey = fresh
  // fetch in TanStack Query), so no overlay re-appears.
  const isManualRun = chartOptions.manualRun === true;
  const [hasEverRun, setHasEverRun] = useState(false);

  // Only fire the query when there's no previewData — useWidgetQuery handles
  // caching so navigating view->edit won't re-run the same query.
  // Parameter-select and form widgets skip query execution entirely.
  const queryInput =
    previewData !== undefined ||
    isParameterWidget ||
    isFormWidget ||
    isContentOnly
      ? null
      : {
          connectionId: widget.connectionId,
          query: widget.query,
          params: widget.params as Record<string, unknown> | undefined,
        };
  const manualEnabled = isManualRun ? hasEverRun : true;
  const { missingParams, ...widgetQuery } = useWidgetQuery(queryInput, {
    staleTime,
    gcTime,
    refetchInterval,
    enabled: manualEnabled,
  });

  // Resolve the current column mapping from widget settings.
  const columnMapping = useMemo<ColumnMapping>(() => {
    const raw = ws.columnMapping;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as ColumnMapping;
    }
    return {};
  }, [ws.columnMapping]);

  // Determine whether to show the overlay.
  const showOverlay =
    isEditMode &&
    supportsColumnMapping(widget.chartType) &&
    !!onWidgetSettingsChange;

  const handleMappingChange = useCallback(
    (newMapping: ColumnMapping) => {
      if (!onWidgetSettingsChange) return;
      onWidgetSettingsChange({
        ...(widget.settings ?? {}),
        columnMapping: newMapping,
      });
    },
    [onWidgetSettingsChange, widget.settings],
  );

  // Resolve styling config (new format or migrated from legacy)
  const allParamValues = useParameterValues();
  const resolvedStylingConfig = useMemo<StylingConfig | undefined>(
    () =>
      resolveStylingConfig(
        ws.stylingConfig as StylingConfig | undefined,
        chartOptions.colorThresholds as string | undefined,
      ),
    [ws.stylingConfig, chartOptions],
  );

  // Resolve color scales config
  const conditionalFormatting = ws.conditionalFormatting as
    | { colorScales?: ColorScaleConfig[] }
    | undefined;
  const colorScales = conditionalFormatting?.colorScales;

  if (!chartConfig) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-8 w-8" />}
        title="Unknown chart type"
        description={`Chart type "${widget.chartType}" is not supported.`}
        className="py-6"
      />
    );
  }

  // Use preview data directly if provided
  if (previewData !== undefined) {
    const validationError = chartConfig.validate?.(previewData) ?? null;
    if (validationError) {
      return (
        <EmptyState
          icon={<AlertCircle className="h-8 w-8" />}
          title="Incompatible data format"
          description={validationError}
          className="py-6"
        />
      );
    }
    const mappedData = chartConfig.transformWithMapping(
      previewData,
      columnMapping,
    );
    // Skip transforms for graph charts — their data shape is incompatible with tabular transforms
    const transformedData =
      dataTransforms.length && widget.chartType !== "graph"
        ? applyTransforms(
            mappedData as Record<string, unknown>[],
            dataTransforms,
            allParamValues,
          )
        : mappedData;
    const availableColumns = extractColumnNames(previewData);
    return (
      <div className="h-full w-full flex flex-col">
        <div className="flex-1 min-h-0">
          <ChartRenderer
            type={chartConfig.type}
            data={transformedData}
            settings={chartOptions}
            styling={{
              rules: resolvedStylingConfig?.rules,
              paramValues: allParamValues,
              colorScales,
            }}
            interaction={
              hasClickAction
                ? { onChartClick: handleChartClick, clickableColumns }
                : undefined
            }
            meta={{
              connectionId: widget.connectionId,
              widgetId: widget.id,
              resultId: previewResultId,
              autoFit,
            }}
          />
        </div>
        {showOverlay && (
          <ColumnMappingOverlay
            chartType={chartConfig.type as "bar" | "line" | "pie"}
            availableColumns={availableColumns}
            mapping={columnMapping}
            onMappingChange={handleMappingChange}
          />
        )}
      </div>
    );
  }

  // Parameter-select widgets are self-contained — skip query lifecycle
  if (isParameterWidget) {
    return (
      <div className="h-full w-full flex flex-col">
        <div className="flex-1 min-h-0">
          <ChartRenderer
            type={chartConfig.type}
            data={null}
            settings={chartOptions}
            meta={{ connectionId: widget.connectionId, widgetId: widget.id }}
          />
        </div>
      </div>
    );
  }

  // Form widgets render their own inputs — no data query needed
  if (isFormWidget) {
    return (
      <div className="h-full w-full flex flex-col">
        <div className="flex-1 min-h-0">
          <ChartRenderer
            type={chartConfig.type}
            data={null}
            settings={widget.settings as Record<string, unknown>}
            meta={{
              connectionId: widget.connectionId,
              widgetId: widget.id,
              query: widget.query,
            }}
          />
        </div>
      </div>
    );
  }

  // Content-only widgets (markdown, iframe) — no query, just render with settings.
  // Substitute $param_xxx placeholders in content/url so markdown and iframe
  // widgets can reference dashboard parameters without executing a query.
  if (isContentOnly) {
    const resolvedContentOptions: Record<string, unknown> = { ...chartOptions };
    if (typeof chartOptions.content === "string") {
      resolvedContentOptions.content = substituteParams(
        chartOptions.content,
        allParamValues,
      );
    }
    if (typeof chartOptions.url === "string") {
      resolvedContentOptions.url = substituteParams(
        chartOptions.url,
        allParamValues,
      );
    }
    return (
      <div className="h-full w-full flex flex-col">
        <div className="flex-1 min-h-0">
          <ChartRenderer
            type={chartConfig.type}
            data={null}
            settings={resolvedContentOptions}
          />
        </div>
      </div>
    );
  }

  // ── Manual Run overlay ──────────────────────────────────────────────────
  // When manualRun is enabled and the user hasn't clicked "Run Query" yet,
  // show an overlay button instead of the loading skeleton.
  if (isManualRun && !hasEverRun) {
    return (
      <div
        className="flex h-full items-center justify-center p-6"
        data-testid="manual-run-overlay"
      >
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Query execution is paused.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHasEverRun(true)}
          >
            <Play className="mr-2 h-4 w-4" />
            Run Query
          </Button>
        </div>
      </div>
    );
  }

  // When enabled:false (params not yet set), TanStack Query returns
  // isPending:true + fetchStatus:"idle".  Show a friendly placeholder
  // instead of the loading skeleton so the user isn't confused by errors.
  if (widgetQuery.isPending && widgetQuery.fetchStatus === "idle") {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Waiting for parameters&hellip;
          </p>
          {missingParams.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {missingParams.map((name) => (
                <MissingParamBadge
                  key={name}
                  name={name}
                  parameterSourceMap={parameterSourceMap}
                  onNavigateToPage={onNavigateToPage}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (widgetQuery.isPending) {
    return (
      <div data-loading="true" className="space-y-3 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (widgetQuery.isError) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Query Failed</AlertTitle>
          <AlertDescription className="space-y-1">
            <p>{widgetQuery.error.message}</p>
            <p
              className="text-xs font-mono opacity-70 truncate"
              title={widget.query}
            >
              {widget.query}
            </p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!widgetQuery.data) {
    return (
      <EmptyState
        title="No data"
        description="No data returned from the query."
        className="py-6"
      />
    );
  }

  const rawData = widgetQuery.data.data;
  const validationError = chartConfig.validate?.(rawData) ?? null;
  if (validationError) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-8 w-8" />}
        title="Incompatible data format"
        description={validationError}
        className="py-6"
      />
    );
  }

  const mappedData = chartConfig.transformWithMapping(rawData, columnMapping);
  const transformedData = dataTransforms.length
    ? applyTransforms(
        mappedData as Record<string, unknown>[],
        dataTransforms,
        allParamValues,
      )
    : mappedData;
  const availableColumns = extractColumnNames(rawData);

  return (
    <div className="h-full w-full flex flex-col">
      {widgetQuery.data?.truncated && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/50 border-b flex items-center gap-1.5">
          <span>&#9888;</span>
          <span>
            Showing first 10,000 rows. Refine your query to see all results.
          </span>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ChartRenderer
          type={chartConfig.type}
          data={transformedData}
          settings={chartOptions}
          styling={{
            rules: resolvedStylingConfig?.rules,
            paramValues: allParamValues,
            colorScales,
          }}
          interaction={
            hasClickAction
              ? { onChartClick: handleChartClick, clickableColumns }
              : undefined
          }
          meta={{
            connectionId: widget.connectionId,
            widgetId: widget.id,
            resultId: widgetQuery.data.resultId,
            autoFit,
          }}
        />
      </div>
      {showOverlay && (
        <ColumnMappingOverlay
          chartType={chartConfig.type as "bar" | "line" | "pie"}
          availableColumns={availableColumns}
          mapping={columnMapping}
          onMappingChange={handleMappingChange}
        />
      )}
    </div>
  );
}
