"use client";

import { CardContainer } from "./card-container";
import type { DashboardLayout, GridLayoutItem } from "@/lib/db/schema";
import { LayoutDashboard } from "lucide-react";
import {
  WidgetCard,
  EmptyState,
  DashboardGrid,
} from "@neoboard/components";

interface DashboardContainerProps {
  layout: DashboardLayout;
  editable?: boolean;
  onRemoveWidget?: (widgetId: string) => void;
  onLayoutChange?: (gridLayout: GridLayoutItem[]) => void;
}

export function DashboardContainer({
  layout,
  editable = false,
  onRemoveWidget,
  onLayoutChange,
}: DashboardContainerProps) {
  if (layout.widgets.length === 0) {
    return (
      <EmptyState
        icon={<LayoutDashboard className="h-12 w-12" />}
        title="No widgets to display"
        description="Add widgets to this dashboard to see your data."
      />
    );
  }

  return (
    <DashboardGrid
      layout={layout.gridLayout as GridLayoutItem[]}
      onLayoutChange={(items) => onLayoutChange?.(items as GridLayoutItem[])}
      isDraggable={editable}
      isResizable={editable}
    >
      {layout.widgets.map((widget) => (
        <div key={widget.id}>
          <WidgetCard
            title={widget.chartType}
            subtitle={widget.query}
            className="h-full"
            actions={
              editable && onRemoveWidget
                ? [
                    {
                      label: "Remove",
                      onClick: () => onRemoveWidget(widget.id),
                      destructive: true,
                    },
                  ]
                : undefined
            }
          >
            <CardContainer widget={widget} />
          </WidgetCard>
        </div>
      ))}
    </DashboardGrid>
  );
}
