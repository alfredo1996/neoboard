import type { EChartsOption } from "echarts";
import type { ColorThreshold } from "./color-threshold";
import { resolveThresholdColor } from "./color-threshold";
import type { StylingRule } from "./styling-rule";
import { resolveStylingRuleColor } from "./styling-rule";

// ---------------------------------------------------------------------------
// Reference lines (markLine)
// ---------------------------------------------------------------------------

export interface ReferenceLine {
  value: number;
  label?: string;
  color?: string;
}

/**
 * Parse a JSON string of reference lines. Returns empty array on
 * invalid input or missing values.
 */
export function parseReferenceLines(input: string | undefined): ReferenceLine[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: unknown): item is ReferenceLine =>
        typeof item === "object" &&
        item !== null &&
        "value" in item &&
        typeof (item as ReferenceLine).value === "number",
    );
  } catch {
    return [];
  }
}

/**
 * Build ECharts markLine data from reference lines.
 */
export function buildMarkLineFromRefs(lines: ReferenceLine[]) {
  if (!lines.length) return undefined;
  return {
    silent: true,
    symbol: "none",
    data: lines.map((line) => ({
      yAxis: line.value,
      label: {
        formatter: line.label ?? String(line.value),
        position: "insideEndTop" as const,
      },
      lineStyle: {
        color: line.color ?? "#888",
        type: "dashed" as const,
      },
    })),
  };
}

/** Detect whether the document is currently in dark mode. */
export function isDark(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * Build the "No data" option with a theme-aware text color.
 * Falls back to neutral gray when document is unavailable (SSR).
 */
function resolveEmptyDataColor(): string {
  return isDark() ? "#a3a3a3" : "#737373";
}

export function buildEmptyDataOption(): EChartsOption {
  return {
    title: {
      text: "No data",
      left: "center",
      top: "center",
      textStyle: { color: resolveEmptyDataColor(), fontSize: 14 },
    },
  };
}

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

/**
 * Resolve a color for a numeric value using styling rules (preferred) or
 * legacy color thresholds as fallback. Returns undefined when no rule matches.
 */
export function resolveItemColor(
  value: number,
  stylingRules: StylingRule[] | undefined,
  paramValues: Record<string, unknown> | undefined,
  thresholds: ColorThreshold[] = [],
): string | undefined {
  if (stylingRules?.length) {
    return resolveStylingRuleColor(value, stylingRules, paramValues);
  }
  if (thresholds.length) {
    return resolveThresholdColor(value, thresholds);
  }
  return undefined;
}
