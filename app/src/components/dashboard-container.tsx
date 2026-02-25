"use client";

import { useState, useMemo } from "react";
import { CardContainer } from "./card-container";
import { getChartConfig } from "@/lib/chart-registry";
import type {
  DashboardPage,
  DashboardWidget,
  GridLayoutItem,
} from "@/lib/db/schema";
import { useParameterStore } from "@/stores/parameter-store";
import { formatParameterValue, filterParentParams } from "@/lib/format-parameter-value";
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
}: DashboardContainerProps) {
  const [fullscreenWidget, setFullscreenWidget] =
    useState<DashboardWidget | null>(null);
  const parameters = useParameterStore((s) => s.parameters);
  const clearParameter = useParameterStore((s) => s.clearParameter);
  const clearAll = useParameterStore((s) => s.clearAll);
  const allEntries = Object.entries(parameters);
  const displayEntries = useMemo(
    () => filterParentParams(allEntries),
    [allEntries]
  );
  const hasParameters = displayEntries.length > 0;

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
          {displayEntries.map(([name, entry]) => (
            <CrossFilterTag
              key={name}
              source={entry.source}
              field={entry.field}
              value={formatParameterValue(entry.value)}
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
              <CardContainer widget={widget} />
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
