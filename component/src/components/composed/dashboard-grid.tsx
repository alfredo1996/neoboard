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
  /**
   * "view": panels share one ruled sheet, 1 px apart. "edit": 8 px gaps and
   * outlined tiles, so dragging and resizing have room (#2219).
   */
  mode?: "view" | "edit";
  compactType?: "vertical" | "horizontal" | null;
  className?: string;
  children: React.ReactNode;
}

const defaultBreakpoints = { lg: 1200, md: 996, sm: 768, xs: 480 };

/**
 * One column count for every breakpoint.
 *
 * A single layout is stored per page. Giving that one layout four different
 * column counts (it used to be lg:12, md:10, sm:6, xs:4) made the grid clamp
 * every item into the narrower count below `lg` — and `onDragStop` handed the
 * clamped layout back, which was then persisted as THE layout. The authored
 * 12-column arrangement got overwritten by its own squashed projection, and
 * because nothing ever widened it again, each save on a narrow window ratcheted
 * it further toward a single column (#1375).
 *
 * The container is the viewport minus the sidebar, so a 1280px window already
 * measures below `lg` — this fired on ordinary laptops, which is why it looked
 * intermittent.
 *
 * So the grid **scales** instead of reflowing: columns get narrower on a small
 * window, the arrangement survives, and a drag can never return fewer columns
 * than it was given. Responsive stacking, if it is ever wanted, has to be a
 * deliberate feature with somewhere to store the per-breakpoint layouts — not a
 * side effect that destroys the only one we keep.
 */
function colsForEveryBreakpoint(cols: number) {
  return { lg: cols, md: cols, sm: cols, xs: cols };
}

// Gutters in px. Saved layouts are in grid units, so changing these moves nothing.
const GUTTER = { view: 1, edit: 8 } as const;

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
  mode,
}: {
  layout: LayoutItem[];
  cols: number;
  rowHeight: number;
  mode: "view" | "edit";
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
          className={cn("absolute", mode === "edit" && "p-1")}
          style={{
            left: `${item.x * colPercent}%`,
            top: item.y * rowHeight,
            width: `${item.w * colPercent}%`,
            height: item.h * rowHeight,
          }}
        >
          <Skeleton
            className={cn(
              "h-full w-full",
              mode === "edit" ? "rounded-sm" : "rounded-none",
            )}
          />
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
  mode = "view",
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

  // Persist ONLY on real user drag/resize. `onLayoutChange` also fires on mount
  // and on responsive reflow when the window is resized across a breakpoint;
  // forwarding those would dirty the dashboard and — since a single layout is
  // stored — overwrite it with the reflowed narrow-column arrangement on save.
  const handleUserLayoutChange = (currentLayout: Layout) => {
    onLayoutChange?.(currentLayout as LayoutItem[]);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full",
        // The sheet: its rule and 8 px radius are the only outer edge. Holes in
        // a layout read as blank paper inside it (#2219).
        mode === "view" &&
          "overflow-hidden rounded-md border border-rule bg-card",
        className,
      )}
    >
      {!mounted && (
        <GridSkeleton
          layout={layout}
          cols={cols}
          rowHeight={rowHeight}
          mode={mode}
        />
      )}
      {mounted && (
        <ResponsiveGridLayout
          width={width}
          layouts={layouts}
          breakpoints={defaultBreakpoints}
          cols={colsForEveryBreakpoint(cols)}
          rowHeight={rowHeight}
          margin={[GUTTER[mode], GUTTER[mode]]}
          containerPadding={[0, 0]}
          dragConfig={{
            enabled: isDraggable,
            bounded: false,
            threshold: 3,
            handle: ".drag-handle",
          }}
          resizeConfig={{ enabled: isResizable, handles: ["se"] }}
          compactor={getCompactorByType(compactType)}
          onDragStop={handleUserLayoutChange}
          onResizeStop={handleUserLayoutChange}
        >
          {children}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}

export { DashboardGrid };
