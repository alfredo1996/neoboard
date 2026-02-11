import * as React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface MetricCardProps {
  title: string;
  value: string | number;
  previousValue?: string | number;
  trend?: "up" | "down" | "neutral";
  sparklineData?: number[];
  format?: (value: number) => string;
  prefix?: string;
  suffix?: string;
  icon?: React.ReactNode;
  className?: string;
}

function MetricCard({
  title,
  value,
  previousValue,
  trend,
  sparklineData,
  format,
  prefix,
  suffix,
  icon,
  className,
}: MetricCardProps) {
  const computedTrend = trend ?? (
    previousValue !== undefined && typeof value === "number" && typeof previousValue === "number"
      ? value > previousValue ? "up" : value < previousValue ? "down" : "neutral"
      : undefined
  );

  const percentChange = previousValue !== undefined && typeof value === "number" && typeof previousValue === "number" && previousValue !== 0
    ? ((value - previousValue) / Math.abs(previousValue)) * 100
    : undefined;

  const displayValue = typeof value === "number" && format ? format(value) : value;

  const trendColor = computedTrend === "up" ? "text-green-600" : computedTrend === "down" ? "text-red-600" : "text-muted-foreground";
  const TrendIcon = computedTrend === "up" ? TrendingUp : computedTrend === "down" ? TrendingDown : Minus;

  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {prefix}{displayValue}{suffix}
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            {computedTrend && (
              <span className={cn("flex items-center gap-1 text-xs", trendColor)}>
                <TrendIcon className="h-3 w-3" />
                {percentChange !== undefined && (
                  <span>{Math.abs(percentChange).toFixed(1)}%</span>
                )}
              </span>
            )}
            {previousValue !== undefined && (
              <span className="text-xs text-muted-foreground">
                vs {typeof previousValue === "number" && format ? format(previousValue) : previousValue}
              </span>
            )}
          </div>
          {sparklineData && sparklineData.length > 1 && (
            <Sparkline data={sparklineData} trend={computedTrend} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Sparkline({ data, trend }: { data: number[]; trend?: "up" | "down" | "neutral" }) {
  const width = 80;
  const height = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });

  const strokeColor = trend === "up" ? "#16a34a" : trend === "down" ? "#dc2626" : "#6b7280";

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export { MetricCard };
