import type { EChartsOption } from "echarts";
import type { ColorThreshold } from "./color-threshold";
import { resolveThresholdColor } from "./color-threshold";
import type { StylingRule } from "./styling-rule";
import { resolveStylingRuleColor } from "./styling-rule";

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
export function formatNumber(value: number | string, config: NumberFormatConfig = {}): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value);

  const { numberFormat = "plain", decimalPlaces, prefix = "", suffix = "" } = config;

  let formatted: string;

  switch (numberFormat) {
    case "comma":
      formatted = decimalPlaces !== undefined
        ? value.toLocaleString("en-US", { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces })
        : value.toLocaleString("en-US");
      break;
    case "compact":
      formatted = Intl.NumberFormat("en", {
        notation: "compact",
        ...(decimalPlaces !== undefined ? { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces } : {}),
      }).format(value);
      break;
    case "percent":
      formatted = decimalPlaces !== undefined
        ? `${value.toFixed(decimalPlaces)}%`
        : `${value}%`;
      break;
    default: // "plain"
      formatted = decimalPlaces !== undefined ? value.toFixed(decimalPlaces) : String(value);
      break;
  }

  return `${prefix}${formatted}${suffix}`;
}

// ---------------------------------------------------------------------------
// ECharts tooltip formatter
// ---------------------------------------------------------------------------

interface TooltipParam {
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
export function buildTooltipFormatter(config: NumberFormatConfig): (params: TooltipParam | TooltipParam[]) => string {
  // Tooltip always uses comma format for readability unless explicitly set
  const tooltipConfig: NumberFormatConfig = { numberFormat: "comma", ...config };

  return (params: TooltipParam | TooltipParam[]) => {
    const items = Array.isArray(params) ? params : [params];
    const header = items[0]?.name ?? "";
    const lines = items.map((p) => {
      const raw = Array.isArray(p.value) ? p.value[1] : p.value;
      const val = typeof raw === "number" ? formatNumber(raw, tooltipConfig) : String(raw ?? "");
      const label = p.seriesName ? `${p.seriesName}: ` : "";
      return `${p.marker ?? ""} ${label}<b>${val}</b>`;
    });
    return header ? `${header}<br/>${lines.join("<br/>")}` : lines.join("<br/>");
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
// ECharts tooltip formatter
// ---------------------------------------------------------------------------

export interface TooltipParam {
  seriesName?: string;
  name?: string;
  value?: unknown;
  marker?: unknown;
}

/**
 * Build an ECharts tooltip formatter function for axis-trigger tooltips.
 * Conditionally includes the series name label only when it is present,
 * preventing "undefined:" from appearing in tooltips.
 *
 * The return type uses `unknown` for the params argument so it is assignable
 * to ECharts' `TooltipFormatterCallback<TopLevelFormatterParams>`.
 */
export function buildTooltipFormatter(): (params: unknown) => string {
  return (params: unknown) => {
    const items = Array.isArray(params) ? (params as TooltipParam[]) : [params as TooltipParam];
    const header = items[0]?.name ?? "";
    const lines = items.map((p) => {
      const raw = Array.isArray(p.value) ? p.value[1] : p.value;
      const val = String(raw ?? "");
      const label = p.seriesName ? `${p.seriesName}: ` : "";
      const marker = typeof p.marker === "string" ? p.marker : "";
      return `${marker} ${label}<b>${val}</b>`;
    });
    return header ? `${header}<br/>${lines.join("<br/>")}` : lines.join("<br/>");
  };
}
