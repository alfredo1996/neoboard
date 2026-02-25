"use client";

import { useState } from "react";
import { CardContainer } from "./card-container";
import { getChartConfig } from "@/lib/chart-registry";
import type {
  DashboardPage,
  DashboardWidget,
  GridLayoutItem,
} from "@/lib/db/schema";
import { useParameterStore } from "@/stores/parameter-store";
import { LayoutDashboard, Maximize2 } from "lucide-react";
import {
  WidgetCard,
  EmptyState,
  DashboardGrid,
  Dialog,
  DialogContent,
  Button,
  ParameterBar,
  CrossFilterTag,
} from "@neoboard/components";

interface DashboardContainerProps {
  /** The active page to render. */
  page: DashboardPage;
  editable?: boolean;
  onRemoveWidget?: (widgetId: string) => void;
  onEditWidget?: (widget: DashboardWidget) => void;
  onDuplicateWidget?: (widgetId: string) => void;
  onLayoutChange?: (gridLayout: GridLayoutItem[]) => void;
  /**
   * Called when a widget's settings are updated inline (e.g. column mapping).
   * The caller should persist the updated widget to the dashboard layout.
   */
  onWidgetSettingsChange?: (widgetId: string, settings: Record<string, unknown>) => void;
}

function getWidgetTitle(widget: DashboardWidget): string {
  if (widget.settings?.title && typeof widget.settings.title === "string") {
    return widget.settings.title;
  }
  return getChartConfig(widget.chartType)?.label ?? widget.chartType;
}

export function DashboardContainer({
  page,
  editable = false,
  onRemoveWidget,
  onEditWidget,
  onDuplicateWidget,
  onLayoutChange,
  onWidgetSettingsChange,
}: DashboardContainerProps) {
  const [fullscreenWidget, setFullscreenWidget] =
    useState<DashboardWidget | null>(null);
  const parameters = useParameterStore((s) => s.parameters);
  const clearParameter = useParameterStore((s) => s.clearParameter);
  const clearAll = useParameterStore((s) => s.clearAll);
  const paramEntries = Object.entries(parameters);
  const hasParameters = paramEntries.length > 0;

  if (page.widgets.length === 0) {
    return (
      <EmptyState
        icon={<LayoutDashboard className="h-12 w-12" />}
        title="No widgets to display"
        description="Add widgets to this dashboard to see your data."
      />
    );
  }

  const buildActions = (widget: DashboardWidget) => {
    if (!editable) return undefined;
    const actions = [];
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
    // Widget Lab is not yet built — option is visible but disabled.
    actions.push({
      label: "Save to Widget Lab",
      onClick: () => undefined,
      disabled: true,
    });
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
      {hasParameters && (
        <ParameterBar onReset={clearAll}>
          {paramEntries.map(([name, entry]) => (
            <CrossFilterTag
              key={name}
              source={entry.source}
              field={entry.field}
              value={String(entry.value)}
              onRemove={() => clearParameter(name)}
            />
          ))}
        </ParameterBar>
      )}
      <DashboardGrid
        layout={page.gridLayout as GridLayoutItem[]}
        onLayoutChange={(items) => onLayoutChange?.(items as GridLayoutItem[])}
        isDraggable={editable}
        isResizable={editable}
      >
        {page.widgets.map((widget) => (
          <div key={widget.id} data-testid="widget-card">
            <WidgetCard
              title={getWidgetTitle(widget)}
              subtitle={undefined}
              className="h-full"
              draggable={editable}
              actions={buildActions(widget)}
              headerExtra={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setFullscreenWidget(widget)}
                >
                  <Maximize2 className="h-4 w-4" />
                  <span className="sr-only">Fullscreen</span>
                </Button>
              }
            >
              <CardContainer
                widget={widget}
                isEditMode={editable}
                onWidgetSettingsChange={
                  onWidgetSettingsChange
                    ? (settings) => onWidgetSettingsChange(widget.id, settings)
                    : undefined
                }
              />
            </WidgetCard>
          </div>
        ))}
      </DashboardGrid>

      <Dialog
        open={fullscreenWidget !== null}
        onOpenChange={(open) => {
          if (!open) setFullscreenWidget(null);
        }}
      >
        <DialogContent className="sm:max-w-[90vw] h-[85vh] flex flex-col">
          {fullscreenWidget && (
            <>
              <h2 className="text-lg font-semibold mb-2">
                {getWidgetTitle(fullscreenWidget)}
              </h2>
              <div className="flex-1 min-h-0">
                <CardContainer widget={fullscreenWidget} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
