import type { EChartsOption } from "echarts";
import type { ColorThreshold } from "./color-threshold";
import { resolveThresholdColor } from "./color-threshold";
import type { StylingRule } from "./styling-rule";
import { resolveStylingRuleColor } from "./styling-rule";
import type { PieChartDataPoint } from "./types";

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

export type NumberFormat = "plain" | "comma" | "compact" | "percent";

export interface NumberFormatConfig {
  numberFormat?: NumberFormat;
  decimalPlaces?: number;
  prefix?: string;
  suffix?: string;
}

/**
 * Format a numeric value with optional decimal places, locale formatting,
 * compact notation, prefix, and suffix. Non-numeric values pass through as-is.
 */
export function formatNumber(
  value: number | string,
  config: NumberFormatConfig = {},
): string {
  if (typeof value !== "number" || !Number.isFinite(value))
    return String(value);

  const {
    numberFormat = "plain",
    decimalPlaces,
    prefix = "",
    suffix = "",
  } = config;

  let formatted: string;

  switch (numberFormat) {
    case "comma":
      formatted =
        decimalPlaces !== undefined
          ? value.toLocaleString("en-US", {
              minimumFractionDigits: decimalPlaces,
              maximumFractionDigits: decimalPlaces,
            })
          : value.toLocaleString("en-US");
      break;
    case "compact":
      formatted = Intl.NumberFormat("en", {
        notation: "compact",
        ...(decimalPlaces !== undefined
          ? {
              minimumFractionDigits: decimalPlaces,
              maximumFractionDigits: decimalPlaces,
            }
          : {}),
      }).format(value);
      break;
    case "percent":
      formatted =
        decimalPlaces !== undefined
          ? `${value.toFixed(decimalPlaces)}%`
          : `${value}%`;
      break;
    default: // "plain"
      formatted =
        decimalPlaces !== undefined
          ? value.toFixed(decimalPlaces)
          : String(value);
      break;
  }

  return `${prefix}${formatted}${suffix}`;
}

// ---------------------------------------------------------------------------
// ECharts tooltip formatter
// ---------------------------------------------------------------------------

export interface TooltipParam {
  seriesName?: string;
  name?: string;
  value?: number | string | (number | string)[];
  marker?: string;
}

/**
 * Build an ECharts tooltip formatter function that applies consistent number
 * formatting across all chart types. Works with both single and array params
 * (item trigger vs axis trigger).
 */
export function buildTooltipFormatter(
  config: NumberFormatConfig = {},
): (params: unknown) => string {
  // Tooltip always uses comma format for readability unless explicitly set
  const tooltipConfig: NumberFormatConfig = {
    numberFormat: "comma",
    ...config,
  };

  return (params: unknown) => {
    const items = Array.isArray(params)
      ? (params as TooltipParam[])
      : [params as TooltipParam];
    const header = items[0]?.name ?? "";
    const lines = items.map((p) => {
      const raw = Array.isArray(p.value) ? p.value[1] : p.value;
      const val =
        typeof raw === "number"
          ? formatNumber(raw, tooltipConfig)
          : String(raw ?? "");
      const label = p.seriesName ? `${p.seriesName}: ` : "";
      const marker = typeof p.marker === "string" ? p.marker : "";
      return `${marker} ${label}<b>${val}</b>`;
    });
    return header
      ? `${header}<br/>${lines.join("<br/>")}`
      : lines.join("<br/>");
  };
}

// ---------------------------------------------------------------------------
// Axis label auto-rotation and truncation
// ---------------------------------------------------------------------------

export interface CategoryAxisLabelOptions {
  /** Override the automatic rotation angle. -1 means automatic (sentinel). */
  rotateOverride?: number;
  /** Maximum label length before truncation (default: 15). */
  maxLabelLength?: number;
  /** Whether the chart is in compact mode (hides labels). */
  compact?: boolean;
  /** Container width in pixels — used for width-based auto-rotation. */
  containerWidth?: number;
}

export interface CategoryAxisLabelConfig {
  show: boolean;
  rotate: number;
  formatter?: (value: string) => string;
  tooltip: { show: boolean };
}

/**
 * Compute axis label rotation and truncation based on category count.
 * - 8+ categories: rotate 30°
 * - 15+ categories: rotate 45°
 * - Labels longer than maxLabelLength are truncated with ellipsis (U+2026)
 * - ECharts axisPointer tooltip shows the full text on hover
 *
 * A `rotateOverride` of -1 is the "automatic" sentinel from the UI and is
 * normalized to undefined so the category-count heuristic applies.
 */
export function buildCategoryAxisLabel(
  categoryCount: number,
  options: CategoryAxisLabelOptions = {},
): CategoryAxisLabelConfig {
  const { maxLabelLength = 15, compact = false, containerWidth } = options;
  // Normalize -1 sentinel (automatic mode) to undefined so ECharts uses its
  // default auto-rotation instead of receiving an invalid rotate: -1.
  const rotateOverride =
    options.rotateOverride === -1 ? undefined : options.rotateOverride;

  let rotate: number;
  if (rotateOverride !== undefined) {
    rotate = rotateOverride;
  } else if (containerWidth && categoryCount > 0) {
    // Width-aware rotation: compute available space per label.
    // Rough budget: label width ≈ maxLabelLength * 7px at 12px font.
    const pixelsPerLabel = containerWidth / categoryCount;
    if (pixelsPerLabel < 40) {
      rotate = 60;
    } else if (pixelsPerLabel < 70) {
      rotate = 45;
    } else if (pixelsPerLabel < 100) {
      rotate = 30;
    } else {
      rotate = 0;
    }
  } else if (categoryCount >= 15) {
    rotate = 45;
  } else if (categoryCount >= 8) {
    rotate = 30;
  } else {
    rotate = 0;
  }

  // Width-aware truncation: tighter limit in narrow containers
  const effectiveMaxLength =
    containerWidth && containerWidth < 400
      ? Math.min(maxLabelLength, 10)
      : maxLabelLength;
  const needsTruncation =
    categoryCount >= 8 ||
    (containerWidth !== undefined && containerWidth < 400);
  const formatter = needsTruncation
    ? (value: string) =>
        value.length > effectiveMaxLength
          ? value.slice(0, effectiveMaxLength - 1) + "\u2026"
          : value
    : undefined;

  return {
    show: !compact,
    rotate,
    formatter,
    tooltip: { show: true },
  };
}

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
export function parseReferenceLines(
  input: string | undefined,
): ReferenceLine[] {
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

// ---------------------------------------------------------------------------
// Gauge threshold zones
// ---------------------------------------------------------------------------

/**
 * Parse gauge threshold zones from a JSON string into the ECharts
 * axisLine.lineStyle.color format: [[percentage, color], ...]
 * Each zone's value is normalized to a 0-1 percentage of the min-max range.
 */
export function parseGaugeThresholdZones(
  input: string | undefined,
  min: number,
  max: number,
): [number, string][] {
  const DEFAULT_ZONE: [number, string][] = [[1, "#E6EBF8"]];
  if (!input) return DEFAULT_ZONE;
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_ZONE;
    const range = max - min;
    if (range <= 0) return DEFAULT_ZONE;
    const zones = parsed.filter(
      (z: unknown): z is { value: number; color: string } =>
        typeof z === "object" && z !== null && "value" in z && "color" in z,
    );
    return zones.map(
      (z) => [(z.value - min) / range, z.color] as [number, string],
    );
  } catch {
    return DEFAULT_ZONE;
  }
}

// ---------------------------------------------------------------------------
// Pie chart Top-N grouping
// ---------------------------------------------------------------------------

/**
 * Group pie chart data by keeping the top N slices and aggregating the rest
 * into an "Other" slice. Returns the original data when topN is 0 or >= data length.
 * Data must already be sorted descending by value.
 */
export function groupTopN(
  data: PieChartDataPoint[],
  topN: number,
): PieChartDataPoint[] {
  if (!data.length || topN <= 0 || topN >= data.length) return data;
  const top = data.slice(0, topN);
  const rest = data.slice(topN);
  const otherValue = rest.reduce((sum, d) => sum + d.value, 0);
  return [...top, { name: "Other", value: otherValue }];
}

// ---------------------------------------------------------------------------
// Time-axis detection
// ---------------------------------------------------------------------------

/**
 * Check if x-axis values look like dates/timestamps.
 * Samples up to the first 5 values — if all parse as valid dates, returns true.
 */
export function isTimeSeriesData(values: unknown[]): boolean {
  if (values.length === 0) return false;
  const sample = values.slice(0, 5);
  return sample.every((v) => {
    if (v === null || v === undefined) return false;
    // Skip pure numbers that look like years (1900-2100) — those are category, not time
    if (typeof v === "number" && v >= 1900 && v <= 2100) return false;
    const d = new Date(v as string | number);
    return !isNaN(d.getTime());
  });
}
