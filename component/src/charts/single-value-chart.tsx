import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SingleValueFontSize = "sm" | "md" | "lg" | "xl";
export type SingleValueNumberFormat = "plain" | "comma" | "compact" | "percent";

/** A color threshold entry: value below which the given color applies. */
export interface ColorThreshold {
  value: number;
  color: string;
}

/** Parse a JSON string of ColorThreshold entries; returns [] on error. */
function parseColorThresholds(raw: string): ColorThreshold[] {
  if (!raw.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is ColorThreshold =>
        typeof t === "object" &&
        t !== null &&
        "value" in t &&
        "color" in t &&
        typeof (t as ColorThreshold).value === "number" &&
        typeof (t as ColorThreshold).color === "string",
    );
  } catch {
    return [];
  }
}

/** Returns the first matching threshold color for a numeric value, or undefined. */
function resolveThresholdColor(
  numericValue: number,
  thresholds: ColorThreshold[],
): string | undefined {
  const sorted = [...thresholds].sort((a, b) => a.value - b.value);
  for (const t of sorted) {
    if (numericValue <= t.value) return t.color;
  }
  return undefined;
}

/** Format a numeric value according to the chosen format. */
function applyNumberFormat(numericValue: number, fmt: SingleValueNumberFormat): string {
  switch (fmt) {
    case "comma":
      return numericValue.toLocaleString();
    case "compact":
      return Intl.NumberFormat("en", { notation: "compact" }).format(numericValue);
    case "percent":
      return `${numericValue}%`;
    default:
      return String(numericValue);
  }
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
  /** JSON string of [{ value: number, color: string }] thresholds */
  colorThresholds?: string;
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
  colorThresholds,
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
    } else if (numberFormat !== "plain") {
      displayValue = applyNumberFormat(value, numberFormat);
    } else {
      displayValue = value;
    }
  } else {
    displayValue = value;
  }

  // Resolve color from thresholds when value is numeric
  const thresholds = colorThresholds ? parseColorThresholds(colorThresholds) : [];
  const thresholdColor =
    typeof value === "number" && thresholds.length > 0
      ? resolveThresholdColor(value, thresholds)
      : undefined;

  const trendColor =
    trend?.direction === "up"
      ? "text-green-600"
      : trend?.direction === "down"
        ? "text-red-600"
        : "text-muted-foreground";

  const trendArrow =
    trend?.direction === "up" ? "\u2191" : trend?.direction === "down" ? "\u2193" : "\u2192";

  const valueSizeClass = FONT_SIZE_CLASS[fontSize] ?? FONT_SIZE_CLASS.lg;

  return (
    <Card className={cn(className)} data-testid="single-value-chart">
      {title && (
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
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
              style={thresholdColor ? { color: thresholdColor } : undefined}
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
