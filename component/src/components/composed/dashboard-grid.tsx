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
import { Skeleton } from "@/components/ui/skeleton";
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

/** Skeleton grid shown while the container width is being measured. */
function GridSkeleton({
  layout,
  cols,
  rowHeight,
}: {
  layout: LayoutItem[];
  cols: number;
  rowHeight: number;
}) {
  if (layout.length === 0) return null;
  const colPercent = 100 / cols;
  const maxBottom = layout.reduce(
    (max, item) => Math.max(max, (item.y + item.h) * rowHeight),
    0,
  );
  return (
    <div className="relative w-full" style={{ height: maxBottom }}>
      {layout.map((item) => (
        <div
          key={item.i}
          className="absolute p-1"
          style={{
            left: `${item.x * colPercent}%`,
            top: item.y * rowHeight,
            width: `${item.w * colPercent}%`,
            height: item.h * rowHeight,
          }}
        >
          <Skeleton className="h-full w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
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
  const { width, mounted, containerRef } = useContainerWidth({
    measureBeforeMount: true,
  });

  const layouts = React.useMemo(
    () => ({ lg: layout, md: layout, sm: layout, xs: layout }),
    [layout],
  );

  return (
    <div ref={containerRef} className={cn("w-full", className)}>
      {!mounted && (
        <GridSkeleton layout={layout} cols={cols} rowHeight={rowHeight} />
      )}
      {mounted && (
        <ResponsiveGridLayout
          width={width}
          layouts={layouts}
          breakpoints={defaultBreakpoints}
          cols={{ ...defaultCols, lg: cols }}
          rowHeight={rowHeight}
          dragConfig={{
            enabled: isDraggable,
            bounded: false,
            threshold: 3,
            handle: ".drag-handle",
          }}
          resizeConfig={{ enabled: isResizable, handles: ["se"] }}
          compactor={getCompactorByType(compactType)}
          onLayoutChange={(currentLayout: Layout) => {
            onLayoutChange?.(currentLayout as LayoutItem[]);
          }}
        >
          {children}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}

export { DashboardGrid };
