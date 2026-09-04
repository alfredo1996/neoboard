import type { EChartsOption } from "echarts";
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
 *
 * Defaults (#911): when *both* numberFormat and decimalPlaces are undefined,
 * apply `numberFormat: "comma"` + `decimalPlaces: 2`. Excel-like, readable,
 * predictable. If either is set explicitly — even `decimalPlaces: 0` — the
 * caller wins and the default does not apply.
 */
/**
 * Normalise the editor's "Decimal Places" option (#1581). The control writes
 * `-1` for "automatic", which `formatNumber` expresses as `undefined`; every
 * chart that reads the option goes through here so the sentinel, the floor and
 * the 0-6 range the option advertises are defined once.
 */
export function normalizeDecimalPlaces(
  value: number | undefined,
): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0)
    return undefined;
  return Math.min(6, Math.floor(value));
}

export function formatNumber(
  value: number | string,
  config: NumberFormatConfig = {},
): string {
  if (typeof value !== "number" || !Number.isFinite(value))
    return String(value);

  const bothUnset =
    config.numberFormat === undefined && config.decimalPlaces === undefined;

  const {
    numberFormat = bothUnset ? "comma" : "plain",
    decimalPlaces = bothUnset ? 2 : undefined,
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
      // Takes a RATIO and scales it — 0.2005 → "20.05%" — matching Intl's own
      // `style: "percent"` and every spreadsheet. It used to append a bare "%"
      // and scale nothing, which meant a genuine share rendered 100x too small
      // with nothing in the UI to distinguish it from a real value (#1396).
      // With no explicit decimalPlaces, cap at 2 rather than take Intl's
      // default of 0 — rounding 20.05% to "20%" is the same class of silent
      // precision loss this fix exists to remove.
      formatted = Intl.NumberFormat("en-US", {
        style: "percent",
        ...(decimalPlaces !== undefined
          ? {
              minimumFractionDigits: decimalPlaces,
              maximumFractionDigits: decimalPlaces,
            }
          : { maximumFractionDigits: 2 }),
      }).format(value);
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
// Contrast text color (WCAG luminance)
// ---------------------------------------------------------------------------

/**
 * Label treatment for white text rendered on colored chart fills (treemap
 * cells, sunburst segments). A SOFT blurred drop-shadow — not a hard stroke —
 * keeps the text crisp on saturated/dark cells (where the shadow is invisible)
 * while lifting it enough to read on the pale child cells the palette generates
 * (light-lavender / light-cyan). A hard outline haloed every glyph and muddied
 * the text on dark cells; the shadow is cleaner and less "templated".
 *
 * For text whose fill color is known per element (packed circles), prefer
 * `contrastTextColor` instead — it picks black or white per cell, which beats
 * a shadow on light fills.
 */
export const FILL_LABEL_COLOR = "#ffffff";
export const FILL_LABEL_SHADOW = "rgba(0, 0, 0, 0.55)";
export const FILL_LABEL_SHADOW_BLUR = 4;

/** Spreadable ECharts series-label style for white-on-fill labels. */
export const fillLabelStyle = {
  color: FILL_LABEL_COLOR,
  textShadowColor: FILL_LABEL_SHADOW,
  textShadowBlur: FILL_LABEL_SHADOW_BLUR,
} as const;

/**
 * Pick black or white text for readability against an arbitrary background
 * color. Accepts `#rgb`, `#rrggbb`, `rgb()` / `rgba()`, and `hsl()` / `hsla()`
 * in comma, space and slash-alpha forms. Anything unparseable (named colors,
 * CSS variables, gradients, garbage) falls back to black — the old call site
 * silently produced invisible white-on-light text when fed an `rgb()` value,
 * and hsl inputs took that same fallback until #1295.
 */
export function contrastTextColor(color: string): string {
  const rgb = parseColorToRgb(color);
  if (!rgb) return "#000000";
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.179 ? "#000000" : "#ffffff";
}

function parseHexColor(s: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (!hex) return null;
  const h = hex[1];
  if (h.length === 3) {
    return [
      Number.parseInt(h[0] + h[0], 16),
      Number.parseInt(h[1] + h[1], 16),
      Number.parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function parseRgbChannel(p: string): number | null {
  const n = p.endsWith("%") ? (Number(p.slice(0, -1)) / 100) * 255 : Number(p);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(255, n));
}

function parseRgbFunctionColor(s: string): [number, number, number] | null {
  const rgb = /^(rgb|rgba)\(([^)]+)\)$/i.exec(s);
  if (!rgb) return null;
  const fn = rgb[1].toLowerCase();
  const parts = rgb[2].split(",").map((p) => p.trim());
  // Strict arity: rgb() needs exactly 3 components, rgba() exactly 4 —
  // anything else (e.g. rgb(1,2,3,4,5)) is malformed and should fall back.
  const expected = fn === "rgb" ? 3 : 4;
  if (parts.length !== expected) return null;
  const channels: number[] = [];
  for (let i = 0; i < 3; i++) {
    const n = parseRgbChannel(parts[i]);
    if (n === null) return null;
    channels.push(n);
  }
  if (fn === "rgba") {
    const alpha = Number(parts[3]);
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
  }
  return [channels[0], channels[1], channels[2]];
}

/** One channel of the standard HSL→RGB conversion, as a 0-1 fraction. */
function hueToChannel(p: number, q: number, t: number): number {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

/** `55%` → 0.55. Percentages only: bare numbers are invalid for S and L. */
function parsePercent(part: string): number | null {
  if (!part.endsWith("%")) return null;
  const n = Number(part.slice(0, -1));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n)) / 100;
}

/**
 * `hsl()` / `hsla()` in the comma, space and slash-alpha forms. The shipped
 * palettes are hsl strings, so without this every chart label and styling-rule
 * cell fell back to black — unreadable on the darker half of the palette
 * (#1295).
 */
function parseHslFunctionColor(s: string): [number, number, number] | null {
  const hsl = /^hsla?\(\s*([^)]+?)\s*\)$/i.exec(s);
  if (!hsl) return null;
  const parts = hsl[1].split(/\s*[,/]\s*|\s+/).filter(Boolean);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const hue = Number(parts[0].replace(/deg$/i, ""));
  const sat = parsePercent(parts[1]);
  const light = parsePercent(parts[2]);
  if (!Number.isFinite(hue) || sat === null || light === null) return null;
  if (parts.length === 4) {
    const alpha = Number(parts[3].replace(/%$/, ""));
    if (!Number.isFinite(alpha)) return null;
  }
  const h = (((hue % 360) + 360) % 360) / 360;
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  return [
    Math.round(hueToChannel(p, q, h + 1 / 3) * 255),
    Math.round(hueToChannel(p, q, h) * 255),
    Math.round(hueToChannel(p, q, h - 1 / 3) * 255),
  ];
}

function parseColorToRgb(input: string): [number, number, number] | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  return (
    parseHexColor(s) ?? parseRgbFunctionColor(s) ?? parseHslFunctionColor(s)
  );
}

// ---------------------------------------------------------------------------
// HTML escaping for tooltip content (prevents XSS via database values)
// ---------------------------------------------------------------------------

/** Escape HTML special characters in a string to prevent injection. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// ECharts tooltip formatter
// ---------------------------------------------------------------------------

export interface TooltipParam {
  seriesName?: string;
  name?: string;
  value?: number | string | (number | string)[];
  marker?: string;
  dataIndex?: number;
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
    const header = escapeHtml(String(items[0]?.name ?? ""));
    const lines = items.map((p) => {
      const raw = Array.isArray(p.value) ? p.value[1] : p.value;
      const val =
        typeof raw === "number"
          ? escapeHtml(formatNumber(raw, tooltipConfig))
          : escapeHtml(String(raw ?? ""));
      const label = p.seriesName ? `${escapeHtml(p.seriesName)}: ` : "";
      // marker is ECharts-generated HTML (colored dot) — safe to pass through
      const marker = typeof p.marker === "string" ? p.marker : "";
      return `${marker} ${label}<b>${val}</b>`;
    });
    return header
      ? `${header}<br/>${lines.join("<br/>")}`
      : lines.join("<br/>");
  };
}

/**
 * Build a tooltip formatter for percent-stacked charts.
 * Shows "pct% (absolute)" for each series item.
 *
 * @param seriesKeys - ordered series key names
 * @param data       - the original data rows (used to look up absolute values)
 */
export function buildPercentTooltipFormatter(
  seriesKeys: string[],
  data: Record<string, unknown>[],
): (params: unknown) => string {
  return (params: unknown) => {
    const items = Array.isArray(params)
      ? (params as TooltipParam[])
      : [params as TooltipParam];
    const header = escapeHtml(String(items[0]?.name ?? ""));
    const lines = items.map((p) => {
      const pct = typeof p.value === "number" ? p.value.toFixed(1) : p.value;
      const rowIdx = p.dataIndex ?? 0;
      const seriesKey =
        seriesKeys.find((k) => k === p.seriesName) ?? seriesKeys[0];
      const absValue = seriesKey ? data[rowIdx]?.[seriesKey] : "";
      const safeName = escapeHtml(String(p.seriesName ?? ""));
      const safeAbs = escapeHtml(String(absValue ?? ""));
      // marker is ECharts-generated HTML (colored dot) — safe to pass through
      return `${p.marker ?? ""} ${safeName}: ${pct}% (${safeAbs})`;
    });
    return `<strong>${header}</strong><br/>${lines.join("<br/>")}`;
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
 * - Category labels are never hidden: a compact container drops the value
 *   axis, since a chart with no category names identifies nothing (#1247)
 *
 * A `rotateOverride` of -1 is the "automatic" sentinel from the UI and is
 * normalized to undefined so the category-count heuristic applies.
 */
export function buildCategoryAxisLabel(
  categoryCount: number,
  options: CategoryAxisLabelOptions = {},
): CategoryAxisLabelConfig {
  const { maxLabelLength = 15, containerWidth } = options;
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

  // Width-aware truncation: tighter limit in narrow containers. A compact
  // container is by definition under 400px, so it already gets the tight
  // budget — going tighter still collapses common-prefix labels
  // ("Widget A".."Widget G") into seven identical stubs (#1247).
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
    show: true,
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

/** One ECharts markLine datum. Exactly one of xAxis/yAxis is set. */
interface MarkLineDatum {
  xAxis?: number;
  yAxis?: number;
  label: { formatter: string; position: "insideEndTop" | "end" };
  lineStyle: { color: string; type: "dashed" };
}

/**
 * Build ECharts markLine data from reference lines.
 *
 * `axis` names the chart's VALUE axis, which is not always Y: a horizontal bar
 * chart swaps them (bar-chart.tsx), so the reference value belongs on X there.
 * Anchoring a numeric value to the category axis does not error — ECharts
 * silently drops the line when the value is outside the ordinal extent, and
 * draws it on the wrong row when it happens to fall inside (#1548).
 *
 * The label follows the axis because the line's orientation does.
 * `insideEndTop` renders rotated 90 degrees on a vertical line, so the X case
 * uses `end` — unrotated, just above the line. GanttChart has anchored on the
 * value axis this way since it was written (gantt-chart.tsx).
 */
export function buildMarkLineFromRefs(
  lines: ReferenceLine[],
  axis: "x" | "y" = "y",
) {
  if (!lines.length) return undefined;
  const onX = axis === "x";
  return {
    silent: true,
    symbol: "none",
    data: lines.map((line): MarkLineDatum => ({
      ...(onX ? { xAxis: line.value } : { yAxis: line.value }),
      label: {
        formatter: line.label ?? String(line.value),
        position: onX ? "end" : "insideEndTop",
      },
      lineStyle: {
        color: line.color ?? "#888",
        type: "dashed",
      },
    })),
  };
}

/**
 * Return `color` at zero alpha, preserving its hue (#1244).
 *
 * Gradient fades must end on the same colour transparent — NOT on
 * `rgba(255,255,255,0)`. Canvas interpolates gradients in non-premultiplied
 * RGBA, so fading a saturated colour to transparent white washes through pale
 * grey, which is half of why the dark-mode area fill looked muddy.
 */
export function fadeToTransparent(color: string): string {
  const c = color.trim();
  if (c.startsWith("hsla(") || c.startsWith("rgba(")) {
    // Already has an alpha channel — replace it with 0.
    return c.replace(/,\s*[\d.]+\s*\)$/, ", 0)");
  }
  if (c.startsWith("hsl(")) {
    return `hsla(${c.slice(4, -1)}, 0)`;
  }
  if (c.startsWith("rgb(")) {
    return `rgba(${c.slice(4, -1)}, 0)`;
  }
  // #rgb / #rrggbb → 8-digit hex with zero alpha.
  if (/^#[0-9a-f]{6}$/i.test(c)) return `${c}00`;
  if (/^#[0-9a-f]{3}$/i.test(c)) {
    const [, r, g, b] = c;
    return `#${r}${r}${g}${g}${b}${b}00`;
  }
  // Unknown format (e.g. a raw CSS var). Fade to transparent black rather
  // than white — white is the bug this function exists to prevent.
  return "rgba(0, 0, 0, 0)";
}

/**
 * Build the "No data" option with a theme-aware text color.
 *
 * Matches the exact --muted-foreground hex the registered ECharts themes use
 * for axis/legend text (#666d7a light, #959ba7 dark) so the empty message
 * reads as the same muted tone as the rest of the chart, not an ad-hoc gray.
 *
 * `dark` is a required argument, not a DOM read. This used to call an isDark()
 * helper that read <html class="dark"> synchronously; every caller invokes it
 * from inside a useMemo whose deps carry no theme entry, so the colour froze
 * at mount-time theme (#1286). Making it a parameter forces each caller to
 * subscribe via useDarkMode() and makes the compiler the enforcement.
 */
export function buildEmptyDataOption(dark: boolean): EChartsOption {
  return {
    title: {
      text: "No data",
      left: "center",
      top: "center",
      textStyle: { color: dark ? "#959ba7" : "#666d7a", fontSize: 14 },
    },
  };
}

/**
 * Auto-derive a screen-reader description from a chart's data shape.
 * Used by bar/line/etc. when the caller does not pass an explicit
 * ariaDescription — replaces the generic ECharts "This is a chart"
 * fallback with something that names the rows, series count and series.
 *
 * @param chartType   Human-readable chart kind, e.g. "Bar chart"
 * @param data        The row array passed to the chart
 * @param labelKey    The row key that holds the X / category label
 *                    (excluded from the series-key enumeration)
 * @param rowNoun     What a row represents — "categories" / "points" / etc.
 */
export function buildAutoAriaDescription(
  chartType: string,
  data: Record<string, unknown>[],
  labelKey: string,
  rowNoun: string,
): string {
  if (!data.length) return `${chartType} with no data`;
  const seen = new Set<string>();
  const seriesKeys: string[] = [];
  for (const row of data) {
    for (const k of Object.keys(row)) {
      if (k !== labelKey && !seen.has(k)) {
        seen.add(k);
        seriesKeys.push(k);
      }
    }
  }
  const seriesPart = seriesKeys.length
    ? `${seriesKeys.length} series: ${seriesKeys.join(", ")}`
    : "0 series";
  return `${chartType} with ${data.length} ${rowNoun} and ${seriesPart}`;
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
 * ECharts legend config. Bottom-aligned everywhere, per the design system
 * (design-review skill §4) — pie and radar already were, and the top/left/right
 * positions the editor used to offer contradicted it (#1592). Type "scroll"
 * keeps long legends usable.
 */
export function buildLegend(show: boolean) {
  return show ? { type: "scroll" as const, bottom: 0 } : undefined;
}

/**
 * Standard ECharts grid with compact-aware margins, reserving room beneath the
 * plot when a legend is shown so the two never overlap.
 */
export function buildCompactGrid(compact: boolean, showLegend: boolean) {
  const base = compact ? 8 : 16;
  return {
    left: base,
    right: base,
    top: base,
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
  paramValues?: Record<string, unknown>,
): string | undefined {
  if (stylingRules?.length) {
    return resolveStylingRuleColor(value, stylingRules, paramValues);
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
 * Group pie chart data by keeping the N largest slices and aggregating the
 * rest into an "Other" slice. Returns the original data when topN is 0 or
 * >= data length.
 *
 * Selects by VALUE, not by position. The previous version sliced the first N
 * rows and documented "data must already be sorted descending" — a
 * precondition nothing enforced. The pie chart's `sortSlices` defaults to
 * false, so a query without ORDER BY meant "Top 5" showed the first five rows
 * and could bury the largest value in "Other" (#1287).
 *
 * Survivors keep their INPUT order, so `sortSlices` still decides display
 * order; this only decides which slices survive.
 */
export function groupTopN(
  data: PieChartDataPoint[],
  topN: number,
): PieChartDataPoint[] {
  if (!data.length || topN <= 0 || topN >= data.length) return data;

  const cutoff = [...data]
    .sort((a, b) => b.value - a.value)
    .slice(0, topN)
    .map((d) => d.name);
  const keep = new Set(cutoff);

  const top: PieChartDataPoint[] = [];
  let otherValue = 0;
  for (const d of data) {
    // Delete on match so duplicate names don't all survive on one slot.
    if (keep.delete(d.name)) top.push(d);
    else otherValue += d.value;
  }

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
