import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  /** Format function for numeric values */
  format?: (value: number) => string;
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

  const displayValue =
    typeof value === "number" && format ? format(value) : value;

  const trendColor =
    trend?.direction === "up"
      ? "text-green-600"
      : trend?.direction === "down"
        ? "text-red-600"
        : "text-muted-foreground";

  const trendArrow =
    trend?.direction === "up" ? "\u2191" : trend?.direction === "down" ? "\u2193" : "\u2192";

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
            <div className="text-3xl font-bold tracking-tight">
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
