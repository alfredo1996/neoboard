import * as React from "react";
import {
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor,
  horizontalCompactor,
  noCompactor,
} from "react-grid-layout";
import type { LayoutItem, Layout } from "react-grid-layout";
import { cn } from "@/lib/utils";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

export type { LayoutItem };

export interface DashboardGridProps {
  layout: LayoutItem[];
  onLayoutChange?: (layout: LayoutItem[]) => void;
  cols?: number;
  rowHeight?: number;
  isDraggable?: boolean;
  isResizable?: boolean;
  compactType?: "vertical" | "horizontal" | null;
  className?: string;
  children: React.ReactNode;
}

const defaultBreakpoints = { lg: 1200, md: 996, sm: 768, xs: 480 };
const defaultCols = { lg: 12, md: 10, sm: 6, xs: 4 };

function getCompactorByType(type: "vertical" | "horizontal" | null) {
  if (type === "horizontal") return horizontalCompactor;
  if (type === null) return noCompactor;
  return verticalCompactor;
}

function DashboardGrid({
  layout,
  onLayoutChange,
  cols = 12,
  rowHeight = 80,
  isDraggable = true,
  isResizable = true,
  compactType = "vertical",
  className,
  children,
}: DashboardGridProps) {
  const { width, containerRef } = useContainerWidth();

  const layouts = React.useMemo(
    () => ({ lg: layout, md: layout, sm: layout, xs: layout }),
    [layout]
  );

  return (
    <div ref={containerRef} className={cn("w-full", className)}>
      <ResponsiveGridLayout
        width={width}
        layouts={layouts}
        breakpoints={defaultBreakpoints}
        cols={{ ...defaultCols, lg: cols }}
        rowHeight={rowHeight}
        dragConfig={{ enabled: isDraggable, bounded: false, threshold: 3, handle: ".drag-handle" }}
        resizeConfig={{ enabled: isResizable, handles: ["se"] }}
        compactor={getCompactorByType(compactType)}
        onLayoutChange={(currentLayout: Layout) => {
          onLayoutChange?.(currentLayout as LayoutItem[]);
        }}
      >
        {children}
      </ResponsiveGridLayout>
    </div>
  );
}

export { DashboardGrid };
