import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StylingRule } from "./styling-rule";
import { resolveStylingRuleColor } from "./styling-rule";
import { formatNumber } from "./chart-utils";
import type { NumberFormat } from "./chart-utils";

export type { ColorThreshold } from "./color-threshold";
export type SingleValueFontSize = "sm" | "md" | "lg" | "xl";
export type SingleValueNumberFormat = NumberFormat;

/** Return black or white text based on background luminance for readability. */
function contrastTextColor(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const lum =
    0.2126 * (r <= 0.03928 ? r / 12.92 : ((r + 0.055) / 1.055) ** 2.4) +
    0.7152 * (g <= 0.03928 ? g / 12.92 : ((g + 0.055) / 1.055) ** 2.4) +
    0.0722 * (b <= 0.03928 ? b / 12.92 : ((b + 0.055) / 1.055) ** 2.4);
  return lum > 0.179 ? "#000000" : "#ffffff";
}

const FONT_SIZE_CLASS: Record<SingleValueFontSize, string> = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-3xl",
  xl: "text-5xl",
};

export interface SingleValueChartProps {
  /** The main value to display */
  value: string | number;
  /** Title above the value */
  title?: string;
  /** Prefix before value (e.g. "$") */
  prefix?: string;
  /** Suffix after value (e.g. "%") */
  suffix?: string;
  /** Trend indicator */
  trend?: { direction: "up" | "down" | "neutral"; label?: string };
  /** Format function for numeric values (takes precedence over numberFormat) */
  format?: (value: number) => string;
  /** Font size of the main value */
  fontSize?: SingleValueFontSize;
  /** Built-in number formatting applied when value is numeric and format is not provided */
  numberFormat?: SingleValueNumberFormat;
  /** Fixed decimal places (0-6). Set to -1 or omit for automatic. */
  decimalPlaces?: number;
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
  /** Additional CSS classes */
  className?: string;
  /** Show loading state */
  loading?: boolean;
  /** Error to display */
  error?: Error | null;
}

/**
 * Single-value display for KPIs and summary metrics.
 * Pure HTML/CSS -- does not use ECharts.
 */
function SingleValueChart({
  value,
  title,
  prefix,
  suffix,
  trend,
  format,
  fontSize = "lg",
  numberFormat = "plain",
  decimalPlaces,
  stylingRules,
  paramValues,
  className,
  loading = false,
  error = null,
}: SingleValueChartProps) {
  if (error) {
    return (
      <Card className={cn(className)}>
        <CardContent className="flex min-h-[120px] items-center justify-center">
          <span className="text-sm text-destructive" role="alert">
            {error.message}
          </span>
        </CardContent>
      </Card>
    );
  }

  let displayValue: string | number;
  if (typeof value === "number") {
    if (format) {
      displayValue = format(value);
    } else {
      const dp =
        decimalPlaces !== undefined && decimalPlaces >= 0
          ? decimalPlaces
          : undefined;
      displayValue = formatNumber(value, { numberFormat, decimalPlaces: dp });
    }
  } else {
    displayValue = value;
  }

  // Legacy colorThresholds removed — styling is now handled exclusively
  // via stylingRules (migrated at the card-container level).

  // Resolve from styling rules — separate text color and background color
  let textColor: string | undefined;
  let bgColor: string | undefined;
  if (typeof value === "number" && stylingRules?.length) {
    const colorRules = stylingRules.filter(
      (r) => !r.target || r.target === "color",
    );
    const bgRules = stylingRules.filter((r) => r.target === "backgroundColor");
    textColor = colorRules.length
      ? resolveStylingRuleColor(value, colorRules, paramValues)
      : undefined;
    bgColor = bgRules.length
      ? resolveStylingRuleColor(value, bgRules, paramValues)
      : undefined;
  }
  const thresholdColor = textColor;

  const trendColor =
    trend?.direction === "up"
      ? "text-green-600 dark:text-green-400"
      : trend?.direction === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

  const trendArrow =
    trend?.direction === "up"
      ? "\u2191"
      : trend?.direction === "down"
        ? "\u2193"
        : "\u2192";

  const valueSizeClass = FONT_SIZE_CLASS[fontSize] ?? FONT_SIZE_CLASS.lg;

  // Auto-contrast: when background color is set, derive text color for readability
  const autoContrast =
    bgColor && !textColor ? contrastTextColor(bgColor) : undefined;

  return (
    <Card
      className={cn(className)}
      data-testid="single-value-chart"
      style={
        bgColor ? { backgroundColor: bgColor, color: autoContrast } : undefined
      }
    >
      {title && (
        <CardHeader className="pb-2">
          <CardTitle
            className="text-sm font-medium"
            style={
              autoContrast ? { color: autoContrast, opacity: 0.7 } : undefined
            }
          >
            {title}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className={cn(!title && "pt-6")}>
        {loading ? (
          <div className="h-9 w-24 animate-pulse rounded bg-muted" />
        ) : (
          <>
            <div
              className={cn(valueSizeClass, "font-bold tracking-tight")}
              style={{ color: thresholdColor ?? autoContrast ?? undefined }}
            >
              {prefix}
              {displayValue}
              {suffix}
            </div>
            {trend && (
              <div className={cn("mt-1 text-sm", trendColor)}>
                {trendArrow} {trend.label}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export { SingleValueChart };
