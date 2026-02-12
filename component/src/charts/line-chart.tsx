import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps, LineChartDataPoint } from "./types";

export interface LineChartProps extends Omit<BaseChartProps, "options"> {
  /** Array of data points. Each object has an `x` key and one or more numeric series keys. */
  data: LineChartDataPoint[];
  /** X-axis label */
  xAxisLabel?: string;
  /** Y-axis label */
  yAxisLabel?: string;
  /** Smooth the line curve */
  smooth?: boolean;
  /** Fill area under the line */
  area?: boolean;
  /** Show legend (auto-shown when multiple series) */
  showLegend?: boolean;
}

/**
 * Line chart for time-series and continuous data.
 * Accepts `data` as `Array<{ x, y }>` for single series
 * or `Array<{ x, series1, series2 }>` for multiple series.
 */
function LineChart({
  data,
  xAxisLabel,
  yAxisLabel,
  smooth = false,
  area = false,
  showLegend,
  ...rest
}: LineChartProps) {
  const options = useMemo((): EChartsOption => {
    if (!data.length) {
      return { title: { text: "No data", left: "center", top: "center", textStyle: { color: "#999", fontSize: 14 } } };
    }

    const seriesKeys = Object.keys(data[0]).filter((k) => k !== "x");
    const shouldShowLegend = showLegend ?? seriesKeys.length > 1;

    return {
      tooltip: { trigger: "axis" },
      legend: shouldShowLegend ? { bottom: 0 } : undefined,
      grid: {
        left: 48,
        right: 16,
        top: 16,
        bottom: shouldShowLegend ? 40 : 24,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: data.map((d) => String(d.x)),
        name: xAxisLabel,
        nameLocation: "middle",
        nameGap: 30,
      },
      yAxis: {
        type: "value",
        name: yAxisLabel,
        nameLocation: "middle",
        nameGap: 50,
      },
      series: seriesKeys.map((key) => ({
        name: key,
        type: "line" as const,
        data: data.map((d) => d[key] as number),
        smooth,
        areaStyle: area ? {} : undefined,
        emphasis: seriesKeys.length > 1 ? { focus: "series" as const } : {},
      })),
    };
  }, [data, xAxisLabel, yAxisLabel, smooth, area, showLegend]);

  return <BaseChart options={options} {...rest} />;
}

export { LineChart };
