"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CardContainer } from "./card-container";
import { FilterStrip } from "@neoboard/components/kit";
import { scrollAndHighlight } from "@/lib/widget/scroll-to-widget";
import {
  buildDashboardFilters,
  filterClearNames,
} from "@/lib/parameter/dashboard-filters";
import { useFilterBarShown } from "@/hooks/use-filter-bar-shown";
import { useWidgetSourceLine } from "@/hooks/use-widget-source-line";
import { interpolateTitle } from "@/lib/widget/interpolate-title";
import { paramLabel } from "@/lib/parameter/param-label";
import { ConnectionNamesProvider } from "@/components/connection-names-context";
import { buildExportData } from "@/lib/widget/card-utils";
import {
  getShownWidgetQueryData,
  widgetQueryKeyPrefix,
} from "@/hooks/use-widget-query";
import {
  getWidgetDisplayTitle,
  isWidgetTemplateOutdated,
} from "@/lib/widget/widget-utils";
import { isDataWidget } from "@/lib/widget/widget-actions";
import {
  getChartConfig,
  type ConnectorCapabilities,
} from "@/lib/plugin/chart-helpers";
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
import { shouldShowRefreshButton } from "@/lib/query/resolve-cache-options";
import { RefreshCw, SlidersHorizontal } from "lucide-react";
import {
  buildCsvString,
  triggerDownload,
  triggerSvgDownload,
  triggerPngDownload,
  buildExportFilename,
  exportChartToSvg,
  exportChartToPng,
  WidgetCard,
  EmptyState,
  DashboardGrid,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  Button,
  ConfirmDialog,
  focusedMenuTrigger,
  iframeSourceLink,
  substituteParamsInUrl,
  type WidgetCardAction,
  type WidgetCardProps,
} from "@neoboard/components";
import { withWidgetMinHeights } from "@/lib/dashboard/widget-min-height";
import { returnFocus } from "@/lib/return-focus";

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

/** A WidgetCard whose source line is read off the widget's own query (#2247). */
function SourcedWidgetCard({
  widget,
  connectionName,
  ...props
}: Readonly<
  WidgetCardProps & { widget: DashboardWidget; connectionName?: string }
>) {
  const line = useWidgetSourceLine(widget, connectionName);
  // An embedded page runs no query: its source line is the page's domain.
  // Same substitution and values as the iframe's own src (card-container), so
  // the link opens the page shown; iframeSourceLink still refuses non-http(s).
  const paramValues = useParameterValues();
  const template = (
    widget.settings?.chartOptions as { url?: string } | undefined
  )?.url;
  const url =
    template === undefined
      ? undefined
      : substituteParamsInUrl(template, paramValues);
  return (
    <WidgetCard
      {...props}
      // One icon marks every filter card, in view and edit mode (#2367).
      titleIcon={
        widget.chartType === "parameter-select" ? (
          <SlidersHorizontal
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          />
        ) : undefined
      }
      source={(widget.chartType === "iframe" && iframeSourceLink(url)) || line}
    />
  );
}

interface DashboardContainerProps {
  page: DashboardPage;
  editable?: boolean;
  actions?: WidgetActions;
  refetchInterval?: number | false;
  templateMap?: Record<string, WidgetTemplate>;
  /** Maps parameter names to the widgets that set them (for clickable badges). */
  parameterSourceMap?: ParameterSourceMap;
  /** What each connection's connector can do, by connection id (#2137). */
  connectorCapabilities?: Record<string, ConnectorCapabilities>;
  /** Each widget connection's own name, by id, for the source line (#2247). */
  connectionNames?: Record<string, string>;
}

// getWidgetTitle → imported as getWidgetDisplayTitle from @/lib/widget/widget-utils

export function DashboardContainer({
  page,
  editable = false,
  actions,
  refetchInterval,
  templateMap,
  parameterSourceMap,
  connectorCapabilities,
  connectionNames,
}: Readonly<DashboardContainerProps>) {
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
  // Who opened the fullscreen or Sync dialog: neither has a Trigger, so focus
  // goes back here on close (#2148). The fallback is the card's fullscreen
  // button, for a confirmed sync that removes the update button.
  const [dialogOpener, setDialogOpener] = useState<{
    el: HTMLElement | null;
    fallback: HTMLElement | null;
  }>({ el: null, fallback: null });
  const handBackFocus = useCallback(
    (e: Event) => {
      e.preventDefault();
      returnFocus(dialogOpener.el, dialogOpener.fallback);
    },
    [dialogOpener],
  );
  const [pendingSyncWidget, setPendingSyncWidget] =
    useState<DashboardWidget | null>(null);
  // Kept after the dialog closes so its fade-out still names the widget;
  // `syncOpen` alone opens and closes it.
  const [syncOpen, setSyncOpen] = useState(false);
  // The widget Remove was asked on (#2055), and the menu button focus goes
  // back to. Kept after the dialog closes so its fade-out still names the
  // widget; `removeOpen` alone opens and closes it.
  const [removeTarget, setRemoveTarget] = useState<{
    widget: DashboardWidget;
    returnFocusTo: HTMLElement | null;
  } | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const parameters = useParameterStore((s) => s.parameters);
  const clearParameter = useParameterStore((s) => s.clearParameter);
  const clearAll = useParameterStore((s) => s.clearAll);
  const allParamValues = useParameterValues();
  const [barShown] = useFilterBarShown();
  const stripFilters = useMemo(() => {
    // The selector may sit on another page: the workspace switches to it.
    const jump = (pageId: string | undefined, widgetId: string) => {
      if (onNavigateToPage) onNavigateToPage(pageId ?? page.id, widgetId);
      else scrollAndHighlight(widgetId);
    };
    return buildDashboardFilters(parameterSourceMap ?? {}, parameters)
      .filter((f) => f.value !== undefined)
      .map((f) => ({
        id: f.id,
        label: f.label,
        value: f.value ?? "",
        title: f.title,
        onSelect: f.sourceWidgetId
          ? () => jump(f.pageId, f.sourceWidgetId!)
          : undefined,
      }));
  }, [parameterSourceMap, parameters, onNavigateToPage, page.id]);
  const labelOf = (n: string) => paramLabel(n, parameterSourceMap);
  const displayTitle = (widget: DashboardWidget) =>
    interpolateTitle(getWidgetDisplayTitle(widget), parameters, labelOf);

  if (page.widgets.length === 0) {
    return (
      <EmptyState
        title="No widgets to display"
        description="Add widgets to this dashboard to see your data."
      />
    );
  }

  function exportWidgetCsv(widget: DashboardWidget) {
    const cached = getShownWidgetQueryData(queryClient, widget, parameters);
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
          label: "Sync with template…",
          onClick: () => {
            setDialogOpener({ el: focusedMenuTrigger(), fallback: null });
            setPendingSyncWidget(widget);
            setSyncOpen(true);
          },
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
        label: "Remove widget…",
        onClick: () => {
          setRemoveTarget({ widget, returnFocusTo: focusedMenuTrigger() });
          setRemoveOpen(true);
        },
        destructive: true,
      });
    }
    return actions.length > 0 ? actions : undefined;
  };

  return (
    <ConnectionNamesProvider value={connectionNames}>
      {barShown && (
        <FilterStrip
          className="mb-3"
          filters={stripFilters}
          onRemove={(id) =>
            filterClearNames(id).forEach((n) => clearParameter(n))
          }
          onClearAll={clearAll}
        />
      )}
      <div className="w-full min-w-0">
        <DashboardGrid
          layout={withWidgetMinHeights(page.gridLayout, page.widgets)}
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
                <SourcedWidgetCard
                  widget={widget}
                  connectionName={connectionNames?.[widget.connectionId]}
                  title={displayTitle(widget)}
                  className="h-full"
                  mode={editable ? "edit" : "view"}
                  actions={buildActions(widget)}
                  onRefresh={
                    showRefresh
                      ? () => {
                          // Refetch every params variant of this widget's query:
                          // the hook merges $param_xxx values into `params` at
                          // call time, so only the prefix is known here.
                          void queryClient.invalidateQueries({
                            queryKey: widgetQueryKeyPrefix(widget),
                          });
                        }
                      : undefined
                  }
                  onFullscreen={(opener) => {
                    // From the menu (touch) there is no icon button to return
                    // focus to: the menu trigger that was just used is.
                    setDialogOpener({
                      el: opener ?? focusedMenuTrigger(),
                      fallback: null,
                    });
                    openFullscreen(widget);
                  }}
                  headerExtra={
                    outdated ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-amber-500"
                        onClick={(e) => {
                          setDialogOpener({
                            el: e.currentTarget,
                            fallback:
                              e.currentTarget.parentElement?.querySelector<HTMLElement>(
                                "[data-widget-fullscreen]",
                              ) ?? null,
                          });
                          setPendingSyncWidget(widget);
                          setSyncOpen(true);
                        }}
                        aria-label="Template update available"
                        title="Template update available — click to sync"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    ) : undefined
                  }
                >
                  <CardContainer
                    widget={widget}
                    isEditMode={editable}
                    refetchInterval={refetchInterval}
                    onNavigateToPage={onNavigateToPage}
                    parameterSourceMap={parameterSourceMap}
                    currentPageId={page.id}
                    connector={connectorCapabilities?.[widget.connectionId]}
                  />
                </SourcedWidgetCard>
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
        <DialogContent
          className="sm:max-w-[90vw] h-[85vh] flex flex-col"
          onCloseAutoFocus={handBackFocus}
        >
          <DialogTitle className="text-lg font-semibold mb-2">
            {fullscreenWidget ? displayTitle(fullscreenWidget) : "Widget"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            This widget is shown at full size. Press Escape to return to the
            dashboard.
          </DialogDescription>
          {fullscreenWidget && (
            <div className="flex-1 min-h-0">
              {fullscreenReady ? (
                <CardContainer
                  key={`${fullscreenWidget.id}-fullscreen`}
                  widget={fullscreenWidget}
                  refetchInterval={refetchInterval}
                  onNavigateToPage={onNavigateToPage}
                  parameterSourceMap={parameterSourceMap}
                  currentPageId={page.id}
                  connector={
                    connectorCapabilities?.[fullscreenWidget.connectionId]
                  }
                  autoFit
                  widgetIdSuffix="fullscreen"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        action="Sync"
        object="widget"
        name={`${
          interpolateTitle(
            (pendingSyncWidget?.settings?.title as string | undefined) ?? "",
            parameters,
          ).trim() || "this widget"
        } with its template`}
        consequences="Its query, chart type and options are replaced by the template's."
        // Lossy though "Sync" is not a delete verb: the old query is gone.
        destructive
        returnFocusTo={dialogOpener.el}
        returnFocusFallback={dialogOpener.fallback}
        onConfirm={() => {
          if (pendingSyncWidget) onSyncWidget?.(pendingSyncWidget);
        }}
      />

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        // Its own title, not the card header's chart-type fallback ("Bar
        // Chart"): an untitled widget is "this widget".
        action="Remove"
        object="widget"
        name={
          interpolateTitle(
            (removeTarget?.widget.settings?.title as string | undefined) ?? "",
            parameters,
            labelOf,
          ).trim() || undefined
        }
        consequences="It leaves this page when you save. The rest of the dashboard is unchanged."
        returnFocusTo={removeTarget?.returnFocusTo}
        onConfirm={() => {
          if (removeTarget) onRemoveWidget?.(removeTarget.widget.id);
        }}
      />
    </ConnectionNamesProvider>
  );
}
