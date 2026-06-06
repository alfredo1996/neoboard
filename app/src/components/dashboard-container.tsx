"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CardContainer } from "./card-container";
import {
  buildCsvString,
  triggerDownload,
  triggerSvgDownload,
  triggerPngDownload,
  buildExportFilename,
  exportChartToSvg,
  exportChartToPng,
} from "@neoboard/components";
import { interpolateTitle } from "@/lib/widget/interpolate-title";
import { buildExportData } from "@/lib/widget/card-utils";
import {
  getWidgetDisplayTitle,
  isWidgetTemplateOutdated,
} from "@/lib/widget/widget-utils";
import { isDataWidget } from "@/lib/widget/widget-actions";
import { getChartConfig } from "@/lib/plugin/chart-helpers";
import type {
  DashboardPage,
  DashboardWidget,
  GridLayoutItem,
  WidgetTemplate,
} from "@/lib/db/schema";
import type { ParameterSourceMap } from "@/lib/parameter/collect-parameter-names";
import {
  useParameterStore,
  useParameterValues,
} from "@/stores/parameter-store";
import {
  formatParameterValue,
  filterParentParams,
} from "@/lib/parameter/format-parameter-value";
import { shouldShowRefreshButton } from "@/lib/query/resolve-cache-options";
import { LayoutDashboard, Maximize2, RefreshCw } from "lucide-react";
import {
  WidgetCard,
  EmptyState,
  DashboardGrid,
  Dialog,
  DialogContent,
  DialogTitle,
  Button,
  ParameterBar,
  CrossFilterTag,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  type WidgetCardAction,
} from "@neoboard/components";

/** Widget action callbacks — grouped to reduce prop count. */
export interface WidgetActions {
  onRemoveWidget?: (widgetId: string) => void;
  onEditWidget?: (widget: DashboardWidget) => void;
  onDuplicateWidget?: (widgetId: string) => void;
  onLayoutChange?: (gridLayout: GridLayoutItem[]) => void;
  onWidgetSettingsChange?: (
    widgetId: string,
    settings: Record<string, unknown>,
  ) => void;
  /** Called when a click action navigates to a different page. Optionally scrolls to a widget. */
  onNavigateToPage?: (pageId: string, scrollToWidgetId?: string) => void;
  onSyncWidget?: (widget: DashboardWidget) => void;
  onDetachWidget?: (widgetId: string) => void;
}

interface DashboardContainerProps {
  page: DashboardPage;
  editable?: boolean;
  actions?: WidgetActions;
  refetchInterval?: number | false;
  templateMap?: Record<string, WidgetTemplate>;
  showParameterBar?: boolean;
  /** Maps parameter names to the widgets that set them (for clickable badges). */
  parameterSourceMap?: ParameterSourceMap;
}

// getWidgetTitle → imported as getWidgetDisplayTitle from @/lib/widget/widget-utils

export function DashboardContainer({
  page,
  editable = false,
  actions,
  refetchInterval,
  templateMap,
  showParameterBar = true,
  parameterSourceMap,
}: DashboardContainerProps) {
  const {
    onRemoveWidget,
    onEditWidget,
    onDuplicateWidget,
    onLayoutChange,
    onNavigateToPage,
    onSyncWidget,
    onDetachWidget,
  } = actions ?? {};
  const queryClient = useQueryClient();
  const [fullscreenWidget, setFullscreenWidget] =
    useState<DashboardWidget | null>(null);
  // Defer fullscreen content render until the dialog animation (200ms zoom-in-95)
  // settles.  Without this, NVL reads the canvas dimensions mid-animation
  // (at ~95% of final size) and the hit-test coordinates are permanently offset.
  const [fullscreenReady, setFullscreenReady] = useState(false);
  // Track the deferred-ready timer so we can clear it on unmount or when the
  // dialog is closed before the animation settles. Without this, the timer
  // can fire after the component unmounts and call setState on a torn-down
  // tree (jsdom: "window is not defined"; browser: React unmounted-update
  // warning).
  const fullscreenReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const openFullscreen = useCallback((w: DashboardWidget) => {
    setFullscreenReady(false);
    setFullscreenWidget(w);
    if (fullscreenReadyTimerRef.current !== null) {
      clearTimeout(fullscreenReadyTimerRef.current);
    }
    fullscreenReadyTimerRef.current = setTimeout(() => {
      fullscreenReadyTimerRef.current = null;
      setFullscreenReady(true);
    }, 250);
  }, []);
  const closeFullscreen = useCallback(() => {
    if (fullscreenReadyTimerRef.current !== null) {
      clearTimeout(fullscreenReadyTimerRef.current);
      fullscreenReadyTimerRef.current = null;
    }
    setFullscreenWidget(null);
    setFullscreenReady(false);
  }, []);
  useEffect(() => {
    return () => {
      if (fullscreenReadyTimerRef.current !== null) {
        clearTimeout(fullscreenReadyTimerRef.current);
        fullscreenReadyTimerRef.current = null;
      }
    };
  }, []);
  const [pendingSyncWidget, setPendingSyncWidget] =
    useState<DashboardWidget | null>(null);
  const parameters = useParameterStore((s) => s.parameters);
  const clearParameter = useParameterStore((s) => s.clearParameter);
  const clearAll = useParameterStore((s) => s.clearAll);
  const allParamValues = useParameterValues();
  const allEntries = Object.entries(parameters);
  const displayEntries = useMemo(
    () => filterParentParams(allEntries),
    [allEntries],
  );
  const hasParameters = displayEntries.length > 0;

  const scrollToSource = useCallback((sourceWidgetId?: string) => {
    if (!sourceWidgetId) return;
    document
      .querySelector(`[data-widget-id="${sourceWidgetId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  if (page.widgets.length === 0) {
    return (
      <EmptyState
        icon={<LayoutDashboard className="h-12 w-12" />}
        title="No widgets to display"
        description="Add widgets to this dashboard to see your data."
      />
    );
  }

  function exportWidgetCsv(widget: DashboardWidget) {
    const entries = queryClient.getQueriesData<{ data: unknown }>({
      queryKey: ["widget-query", widget.connectionId, widget.query],
    });
    const cached = entries.length > 0 ? entries[0][1] : undefined;
    const transforms = (widget.settings?.transforms ??
      []) as import("@/lib/query/data-transforms").Transform[];
    const exportData = buildExportData(
      cached?.data,
      transforms,
      allParamValues,
    );
    if (exportData.length === 0) return;
    const csv = buildCsvString(exportData);
    const title = (widget.settings?.title as string) || widget.chartType;
    const filename = buildExportFilename(title, "csv", page.title);
    triggerDownload(csv, filename);
  }

  function exportWidgetSvg(widget: DashboardWidget) {
    const el = document.querySelector(`[data-widget-id="${widget.id}"]`);
    if (!el) return;
    // Find the ECharts container (div with data-testid="base-chart")
    const chartEl = el.querySelector<HTMLElement>('[data-testid="base-chart"]');
    if (!chartEl) return;
    const svg = exportChartToSvg(chartEl);
    if (!svg) return;
    const title = (widget.settings?.title as string) || widget.chartType;
    const filename = buildExportFilename(title, "svg", page.title);
    triggerSvgDownload(svg, filename);
  }

  function exportWidgetPng(widget: DashboardWidget) {
    const el = document.querySelector(`[data-widget-id="${widget.id}"]`);
    if (!el) return;
    const chartEl = el.querySelector<HTMLElement>('[data-testid="base-chart"]');
    if (!chartEl) return;
    const dataUrl = exportChartToPng(chartEl);
    if (!dataUrl) return;
    const title = (widget.settings?.title as string) || widget.chartType;
    const filename = buildExportFilename(title, "png", page.title);
    triggerPngDownload(dataUrl, filename);
  }

  const buildActions = (widget: DashboardWidget) => {
    const actions: WidgetCardAction[] = [];

    // ── Export (#912) ─────────────────────────────────────────────
    // Collapse 2+ export formats into a single "Export ▸" submenu so the
    // dropdown stays scannable. Single-format widgets keep a flat item to
    // avoid a needless extra click for the common case.
    const exportChildren: WidgetCardAction[] = [];
    if (isDataWidget(widget.chartType)) {
      exportChildren.push({
        label: "CSV",
        onClick: () => exportWidgetCsv(widget),
      });
    }
    if (getChartConfig(widget.chartType)?.capabilities.isECharts) {
      exportChildren.push(
        { label: "PNG", onClick: () => exportWidgetPng(widget) },
        { label: "SVG", onClick: () => exportWidgetSvg(widget) },
      );
    }
    if (exportChildren.length === 1) {
      const only = exportChildren[0];
      actions.push({ label: `Export ${only.label}`, onClick: only.onClick });
    } else if (exportChildren.length > 1) {
      actions.push({ label: "Export", children: exportChildren });
    }

    // "Save to Widget Library" (formerly Widget Lab) moved to the widget
    // editor modal footer per #913. See widget-editor-modal.tsx.

    if (!editable) return actions.length > 0 ? actions : undefined;
    if (onEditWidget) {
      actions.push({
        label: "Edit Widget",
        onClick: () => onEditWidget(widget),
      });
    }
    if (onDuplicateWidget) {
      actions.push({
        label: "Duplicate",
        onClick: () => onDuplicateWidget(widget.id),
      });
    }
    if (widget.templateId) {
      if (isWidgetTemplateOutdated(widget, templateMap) && onSyncWidget) {
        actions.push({
          label: "Sync with template",
          onClick: () => setPendingSyncWidget(widget),
        });
      }
      if (onDetachWidget) {
        actions.push({
          label: "Detach from template",
          onClick: () => onDetachWidget(widget.id),
        });
      }
    }
    if (onRemoveWidget) {
      actions.push({
        label: "Remove",
        onClick: () => onRemoveWidget(widget.id),
        destructive: true,
      });
    }
    return actions.length > 0 ? actions : undefined;
  };

  return (
    <>
      {hasParameters && showParameterBar && (
        <ParameterBar onReset={clearAll}>
          {displayEntries.map(([name, entry]) => (
            <CrossFilterTag
              key={name}
              field={entry.field}
              value={formatParameterValue(entry.value)}
              onRemove={() => clearParameter(name)}
              onClick={
                entry.sourceWidgetId
                  ? () => scrollToSource(entry.sourceWidgetId)
                  : undefined
              }
              tooltip={entry.source ? `Set by ${entry.source}` : undefined}
            />
          ))}
        </ParameterBar>
      )}
      <div className="w-full min-w-0">
        <DashboardGrid
          layout={page.gridLayout as GridLayoutItem[]}
          onLayoutChange={(items) =>
            onLayoutChange?.(items as GridLayoutItem[])
          }
          isDraggable={editable}
          isResizable={editable}
        >
          {page.widgets.map((widget) => {
            const outdated =
              editable && isWidgetTemplateOutdated(widget, templateMap);
            const chartOpts = ((widget.settings ?? {}).chartOptions ??
              {}) as Record<string, unknown>;
            const showRefresh = shouldShowRefreshButton(chartOpts);
            return (
              <div
                key={widget.id}
                data-testid="widget-card"
                data-widget-id={widget.id}
                onDoubleClick={
                  editable && onEditWidget
                    ? (e: React.MouseEvent) => {
                        if ((e.target as HTMLElement).closest("button")) return;
                        onEditWidget(widget);
                      }
                    : undefined
                }
              >
                <WidgetCard
                  title={interpolateTitle(
                    getWidgetDisplayTitle(widget),
                    parameters,
                  )}
                  subtitle={undefined}
                  className="h-full"
                  draggable={editable}
                  actions={buildActions(widget)}
                  onRefresh={
                    showRefresh
                      ? () => {
                          // Invalidate the TanStack Query entry for this widget so
                          // it refetches. We must mirror the prefix shape used by
                          // useWidgetQuery exactly:
                          //   ["widget-query", connectionId, database, query, params, staleTime]
                          // Earlier we omitted `database`, which made position 2
                          // mismatch (null vs query string), so invalidation never
                          // matched and the refresh button silently no-op'd.
                          //
                          // We intentionally stop the prefix at `query` — the hook
                          // merges $param_xxx values into `params` at call time, so
                          // `widget.params` here is not deep-equal to the hook's
                          // mergedParams when parameters are referenced. Stopping
                          // at `query` guarantees prefix match for both the
                          // parameterless and parameterised cases.
                          void queryClient.invalidateQueries({
                            queryKey: [
                              "widget-query",
                              widget.connectionId,
                              widget.database ?? null,
                              widget.query,
                            ],
                          });
                        }
                      : undefined
                  }
                  headerExtra={
                    <>
                      {outdated && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-amber-500"
                          onClick={() => setPendingSyncWidget(widget)}
                          title="Template update available — click to sync"
                        >
                          <RefreshCw className="h-4 w-4" />
                          <span className="sr-only">
                            Template update available
                          </span>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openFullscreen(widget)}
                      >
                        <Maximize2 className="h-4 w-4" />
                        <span className="sr-only">Fullscreen</span>
                      </Button>
                    </>
                  }
                >
                  <CardContainer
                    widget={widget}
                    isEditMode={editable}
                    refetchInterval={refetchInterval}
                    onNavigateToPage={onNavigateToPage}
                    parameterSourceMap={parameterSourceMap}
                  />
                </WidgetCard>
              </div>
            );
          })}
        </DashboardGrid>
      </div>

      <Dialog
        open={fullscreenWidget !== null}
        onOpenChange={(open) => {
          if (!open) closeFullscreen();
        }}
      >
        <DialogContent className="sm:max-w-[90vw] h-[85vh] flex flex-col">
          <DialogTitle className="text-lg font-semibold mb-2">
            {fullscreenWidget
              ? interpolateTitle(
                  getWidgetDisplayTitle(fullscreenWidget),
                  parameters,
                )
              : "Widget"}
          </DialogTitle>
          {fullscreenWidget && (
            <>
              <div className="flex-1 min-h-0">
                {fullscreenReady ? (
                  <CardContainer
                    key={`${fullscreenWidget.id}-fullscreen`}
                    widget={fullscreenWidget}
                    refetchInterval={refetchInterval}
                    onNavigateToPage={onNavigateToPage}
                    parameterSourceMap={parameterSourceMap}
                    autoFit
                    widgetIdSuffix="fullscreen"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingSyncWidget !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSyncWidget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sync with template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the widget&apos;s current query, chart type, and
              chart options with the latest version from the template. The
              connection will not change. You can still undo by discarding your
              dashboard save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingSyncWidget && onSyncWidget) {
                  onSyncWidget(pendingSyncWidget);
                }
                setPendingSyncWidget(null);
              }}
            >
              Sync
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
