import type { EChartsOption } from "echarts";

/**
 * The ECharts "no data" title option, shared across all chart types.
 * Used when the data array is empty.
 */
export const EMPTY_DATA_OPTION: EChartsOption = {
  title: {
    text: "No data",
    left: "center",
    top: "center",
    textStyle: { color: "#999", fontSize: 14 },
  },
};

/**
 * Compact/responsive breakpoints used consistently across all ECharts components.
 * A chart is "compact" when its container is narrower than 300px.
 * The legend is hidden when the container height is below 200px.
 */
export interface CompactState {
  compact: boolean;
  hideLegend: boolean;
}

/**
 * Derive compact and hideLegend flags from measured container dimensions.
 * Both flags are false when dimensions are not yet known (width === 0).
 */
export function getCompactState(width: number, height: number): CompactState {
  return {
    compact: width > 0 && width < 300,
    hideLegend: width > 0 && height < 200,
  };
}

/**
 * Compute the effective showLegend flag, accounting for:
 * - the explicit prop (when provided)
 * - the number of series (auto-show when > 1)
 * - the hideLegend responsive flag
 */
export function resolveShowLegend(
  showLegend: boolean | undefined,
  seriesCount: number,
  hideLegend: boolean,
): boolean {
  const autoShow = showLegend ?? seriesCount > 1;
  return hideLegend ? false : autoShow;
}

/**
 * Standard ECharts grid with compact-aware margins.
 * Pass `showLegend` to add bottom space for the legend.
 */
export function buildCompactGrid(compact: boolean, showLegend: boolean) {
  return {
    left: compact ? 8 : 16,
    right: compact ? 8 : 16,
    top: compact ? 8 : 16,
    bottom: showLegend ? 40 : compact ? 8 : 24,
    containLabel: true,
  };
}
