import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps, BarChartDataPoint } from "./types";

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
}

/**
 * Bar chart for categorical comparisons.
 * Accepts `data` as `Array<{ label, value }>` for single series
 * or `Array<{ label, series1, series2 }>` for grouped/stacked bars.
 */
function BarChart({
  data,
  orientation = "vertical",
  stacked = false,
  showValues = false,
  showLegend,
  ...rest
}: BarChartProps) {
  const options = useMemo((): EChartsOption => {
    if (!data.length) {
      return { title: { text: "No data", left: "center", top: "center", textStyle: { color: "#999", fontSize: 14 } } };
    }

    const seriesKeys = Object.keys(data[0]).filter((k) => k !== "label");
    const shouldShowLegend = showLegend ?? seriesKeys.length > 1;
    const isHorizontal = orientation === "horizontal";

    const categoryAxis = {
      type: "category" as const,
      data: data.map((d) => d.label),
    };
    const valueAxis = {
      type: "value" as const,
    };

    return {
      tooltip: { trigger: "axis" as const, axisPointer: { type: "shadow" as const } },
      legend: shouldShowLegend ? { bottom: 0 } : undefined,
      grid: {
        left: 16,
        right: 16,
        top: 16,
        bottom: shouldShowLegend ? 40 : 24,
        containLabel: true,
      },
      xAxis: isHorizontal ? valueAxis : categoryAxis,
      yAxis: isHorizontal ? categoryAxis : valueAxis,
      series: seriesKeys.map((key) => ({
        name: key,
        type: "bar" as const,
        data: data.map((d) => d[key] as number),
        stack: stacked ? "total" : undefined,
        label: showValues
          ? { show: true, position: isHorizontal ? ("right" as const) : ("top" as const) }
          : undefined,
        emphasis: { focus: "series" as const },
      })),
    };
  }, [data, orientation, stacked, showValues, showLegend]);

  return <BaseChart options={options} {...rest} />;
}

export { BarChart };
