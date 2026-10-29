import type { DashboardWidget, GridLayoutItem } from "@/lib/db/schema";

/** A number-range selector (inputs + slider) needs about 96px: three rows (#2374). */
const NUMBER_RANGE_MIN_H = 3;

function minHeightOf(widget: DashboardWidget | undefined): number | undefined {
  if (widget?.chartType !== "parameter-select") return undefined;
  // The plugin reads its options from settings.chartOptions (card-container).
  const opts = widget.settings?.chartOptions as
    { parameterType?: string } | undefined;
  return opts?.parameterType === "number-range"
    ? NUMBER_RANGE_MIN_H
    : undefined;
}

/**
 * Per-item `minH` for the grid, plus `h` raised to it. View only: stored
 * layouts are not rewritten. react-grid-layout applies `minH` when resizing,
 * not to items already below it when the layout loads, hence the clamp.
 */
export function withWidgetMinHeights(
  layout: GridLayoutItem[],
  widgets: DashboardWidget[],
): (GridLayoutItem & { minH?: number })[] {
  const byId = new Map(widgets.map((w) => [w.id, w]));
  return layout.map((item) => {
    const minH = minHeightOf(byId.get(item.i));
    return minH === undefined
      ? item
      : { ...item, minH, h: Math.max(item.h, minH) };
  });
}
