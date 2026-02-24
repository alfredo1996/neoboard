import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps, BarChartDataPoint } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";

export interface BarChartProps extends Omit<BaseChartProps, "options"> {
  /** Array of data points. Each object has a `label` key and one or more numeric series keys. */
  data: BarChartDataPoint[];
  /** Bar orientation */
  orientation?: "vertical" | "horizontal";
  /** Stack bars when multiple series */
  stacked?: boolean;
  /** Show values on bars */
  showValues?: boolean;
  /** Show legend (auto-shown when multiple series) */
  showLegend?: boolean;
  /** Bar width in pixels; 0 means auto */
  barWidth?: number;
  /** Gap between bars in a group (e.g. "30%") */
  barGap?: string;
  /** Show Y-axis grid lines */
  showGridLines?: boolean;
  /** X-axis name label */
  xAxisLabel?: string;
  /** Y-axis name label */
  yAxisLabel?: string;
}

/**
 * Bar chart for categorical comparisons.
 * Accepts `data` as `Array<{ label, value }>` for single series
 * or `Array<{ label, series1, series2 }>` for grouped/stacked bars.
 *
 * Adapts to container size:
 * - Below 300px wide: hides value labels and axis labels, tightens grid
 * - Below 200px tall: hides legend
 */
function BarChart({
  data,
  orientation = "vertical",
  stacked = false,
  showValues = false,
  showLegend,
  barWidth = 0,
  barGap = "30%",
  showGridLines = true,
  xAxisLabel,
  yAxisLabel,
  ...rest
}: BarChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const compact = width > 0 && width < 300;
  const hideLegend = width > 0 && height < 200;

  const options = useMemo((): EChartsOption => {
    if (!data.length) {
      return { title: { text: "No data", left: "center", top: "center", textStyle: { color: "#999", fontSize: 14 } } };
    }

    const seriesKeys = Object.keys(data[0]).filter((k) => k !== "label");
    const autoShowLegend = showLegend ?? seriesKeys.length > 1;
    const effectiveShowLegend = hideLegend ? false : autoShowLegend;
    const isHorizontal = orientation === "horizontal";
    const effectiveShowValues = compact ? false : showValues;
    const effectiveBarWidth = barWidth > 0 ? barWidth : undefined;

    const categoryAxis = {
      type: "category" as const,
      data: data.map((d) => d.label),
      axisLabel: { show: !compact },
      name: compact ? undefined : (isHorizontal ? yAxisLabel : xAxisLabel),
      nameLocation: "middle" as const,
      nameGap: 30,
    };
    const valueAxis = {
      type: "value" as const,
      axisLabel: { show: !compact },
      splitLine: { show: showGridLines },
      name: compact ? undefined : (isHorizontal ? xAxisLabel : yAxisLabel),
      nameLocation: "middle" as const,
      nameGap: 50,
    };

    return {
      tooltip: { trigger: "axis" as const, axisPointer: { type: "shadow" as const } },
      legend: effectiveShowLegend ? { bottom: 0 } : undefined,
      grid: {
        left: compact ? 8 : 16,
        right: compact ? 8 : 16,
        top: compact ? 8 : 16,
        bottom: effectiveShowLegend ? 40 : compact ? 8 : 24,
        containLabel: true,
      },
      xAxis: isHorizontal ? valueAxis : categoryAxis,
      yAxis: isHorizontal ? categoryAxis : valueAxis,
      series: seriesKeys.map((key) => ({
        name: key,
        type: "bar" as const,
        data: data.map((d) => d[key] as number),
        stack: stacked ? "total" : undefined,
        barWidth: effectiveBarWidth,
        barGap,
        label: effectiveShowValues
          ? { show: true, position: isHorizontal ? ("right" as const) : ("top" as const) }
          : undefined,
        emphasis: seriesKeys.length > 1 ? { focus: "series" as const } : {},
      })),
    };
  }, [data, orientation, stacked, showValues, showLegend, barWidth, barGap, showGridLines, xAxisLabel, yAxisLabel, compact, hideLegend]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart options={options} {...rest} />
    </div>
  );
}

export { BarChart };
