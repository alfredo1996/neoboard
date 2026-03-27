"use client";

import { useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CardContainer } from "./card-container";
import { getChartConfig } from "@/lib/chart-registry";
import {
  buildCsvString,
  triggerDownload,
  buildExportFilename,
} from "@neoboard/components";
import { applyTransforms } from "@/lib/data-transforms";
import type { Transform } from "@/lib/data-transforms";
import { interpolateTitle } from "@/lib/interpolate-title";
import type {
  DashboardPage,
  DashboardWidget,
  GridLayoutItem,
  WidgetTemplate,
} from "@/lib/db/schema";
import type { ParameterSourceMap } from "@/lib/collect-parameter-names";
import {
  useParameterStore,
  useParameterValues,
} from "@/stores/parameter-store";
import {
  formatParameterValue,
  filterParentParams,
} from "@/lib/format-parameter-value";
import { shouldShowRefreshButton } from "@/lib/resolve-cache-options";
import { LayoutDashboard, Maximize2, RefreshCw } from "lucide-react";
import {
  WidgetCard,
  EmptyState,
  DashboardGrid,
  Dialog,
  DialogContent,
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
  /** Called when the user chooses "Save to Widget Lab" for a widget. */
  onSaveAsTemplate?: (widget: DashboardWidget) => void;
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

function getWidgetTitle(widget: DashboardWidget): string {
  const title = (widget.settings ?? {}).title;
  if (title && typeof title === "string") return title;
  return getChartConfig(widget.chartType)?.label ?? widget.chartType;
}

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
    onWidgetSettingsChange,
    onNavigateToPage,
    onSaveAsTemplate,
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
  const openFullscreen = useCallback((w: DashboardWidget) => {
    setFullscreenReady(false);
    setFullscreenWidget(w);
    setTimeout(() => setFullscreenReady(true), 250);
  }, []);
  const closeFullscreen = useCallback(() => {
    setFullscreenWidget(null);
    setFullscreenReady(false);
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

  function isWidgetOutdated(widget: DashboardWidget): boolean {
    if (!widget.templateId || !widget.templateSyncedAt) return false;
    const tmpl = templateMap?.[widget.templateId];
    if (!tmpl?.updatedAt) return false;
    return new Date(tmpl.updatedAt) > new Date(widget.templateSyncedAt);
  }

  function exportWidgetCsv(widget: DashboardWidget) {
    // Use partial key match — params vary with parameter store values
    const entries = queryClient.getQueriesData<{ data: unknown }>({
      queryKey: ["widget-query", widget.connectionId, widget.query],
    });
    const cached = entries.length > 0 ? entries[0][1] : undefined;
    const rawData = cached?.data;
    if (!Array.isArray(rawData) || rawData.length === 0) return;
    // Apply transforms so the export matches what the user sees
    const transforms = (widget.settings?.transforms ?? []) as Transform[];
    const exportData = transforms.length
      ? applyTransforms(
          rawData as Record<string, unknown>[],
          transforms,
          allParamValues,
        )
      : rawData;
    const csv = buildCsvString(exportData as Record<string, unknown>[]);
    const title = (widget.settings?.title as string) || widget.chartType;
    const filename = buildExportFilename(title, "csv", page.title);
    triggerDownload(csv, filename);
  }

  const buildActions = (widget: DashboardWidget) => {
    const actions = [];

    // Export CSV — available for data-producing widgets in both edit and view mode
    const isDataWidget = ![
      "markdown",
      "iframe",
      "form",
      "parameter-select",
    ].includes(widget.chartType);
    if (isDataWidget) {
      actions.push({
        label: "Export CSV",
        onClick: () => exportWidgetCsv(widget),
      });
    }

    if (!editable) return actions.length > 0 ? actions : undefined;
    if (onEditWidget) {
      actions.push({
        label: "Edit",
        onClick: () => onEditWidget(widget),
      });
    }
    if (onDuplicateWidget) {
      actions.push({
        label: "Duplicate",
        onClick: () => onDuplicateWidget(widget.id),
      });
    }
    if (onSaveAsTemplate) {
      actions.push({
        label: "Save to Widget Lab",
        onClick: () => onSaveAsTemplate(widget),
      });
    }
    if (widget.templateId) {
      if (isWidgetOutdated(widget) && onSyncWidget) {
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
            const outdated = editable && isWidgetOutdated(widget);
            const chartOpts = ((widget.settings ?? {}).chartOptions ??
              {}) as Record<string, unknown>;
            const showRefresh = shouldShowRefreshButton(chartOpts);
            return (
              <div
                key={widget.id}
                data-testid="widget-card"
                data-widget-id={widget.id}
              >
                <WidgetCard
                  title={interpolateTitle(getWidgetTitle(widget), parameters)}
                  subtitle={undefined}
                  className="h-full"
                  draggable={editable}
                  actions={buildActions(widget)}
                  onRefresh={
                    showRefresh
                      ? () => {
                          // Invalidate all TanStack Query entries matching this widget's
                          // connection + query combo. This triggers a refetch.
                          void queryClient.invalidateQueries({
                            queryKey: [
                              "widget-query",
                              widget.connectionId,
                              widget.query,
                              widget.params,
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
                    onWidgetSettingsChange={
                      onWidgetSettingsChange
                        ? (settings) =>
                            onWidgetSettingsChange(widget.id, settings)
                        : undefined
                    }
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
          {fullscreenWidget && (
            <>
              <h2 className="text-lg font-semibold mb-2">
                {interpolateTitle(getWidgetTitle(fullscreenWidget), parameters)}
              </h2>
              <div className="flex-1 min-h-0">
                {fullscreenReady ? (
                  <CardContainer
                    key={`${fullscreenWidget.id}-fullscreen`}
                    widget={fullscreenWidget}
                    refetchInterval={refetchInterval}
                    onNavigateToPage={onNavigateToPage}
                    parameterSourceMap={parameterSourceMap}
                    autoFit
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    Loading…
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
