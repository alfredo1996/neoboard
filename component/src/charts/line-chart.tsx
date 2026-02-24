import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps, LineChartDataPoint } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";

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
  /** Show data point markers */
  showPoints?: boolean;
  /** Line stroke width in pixels */
  lineWidth?: number;
  /** Show grid lines */
  showGridLines?: boolean;
  /** Use stepped line style */
  stepped?: boolean;
}

/**
 * Line chart for time-series and continuous data.
 * Accepts `data` as `Array<{ x, y }>` for single series
 * or `Array<{ x, series1, series2 }>` for multiple series.
 *
 * Adapts to container size:
 * - Below 300px wide: hides axis labels, tightens grid margins
 * - Below 200px tall: hides legend
 */
function LineChart({
  data,
  xAxisLabel,
  yAxisLabel,
  smooth = false,
  area = false,
  showLegend,
  showPoints = false,
  lineWidth = 2,
  showGridLines = true,
  stepped = false,
  ...rest
}: LineChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const compact = width > 0 && width < 300;
  const hideLegend = width > 0 && height < 200;

  const options = useMemo((): EChartsOption => {
    if (!data.length) {
      return { title: { text: "No data", left: "center", top: "center", textStyle: { color: "#999", fontSize: 14 } } };
    }

    const seriesKeys = Object.keys(data[0]).filter((k) => k !== "x");
    const autoShowLegend = showLegend ?? seriesKeys.length > 1;
    const effectiveShowLegend = hideLegend ? false : autoShowLegend;

    return {
      tooltip: { trigger: "axis" },
      legend: effectiveShowLegend ? { bottom: 0 } : undefined,
      grid: {
        left: compact ? 8 : 48,
        right: compact ? 8 : 16,
        top: compact ? 8 : 16,
        bottom: effectiveShowLegend ? 40 : compact ? 8 : 24,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: data.map((d) => String(d.x)),
        name: compact ? undefined : xAxisLabel,
        nameLocation: "middle",
        nameGap: 30,
        axisLabel: { show: !compact },
      },
      yAxis: {
        type: "value",
        name: compact ? undefined : yAxisLabel,
        nameLocation: "middle",
        nameGap: 50,
        axisLabel: { show: !compact },
        splitLine: { show: showGridLines },
      },
      series: seriesKeys.map((key) => ({
        name: key,
        type: "line" as const,
        data: data.map((d) => d[key] as number),
        smooth,
        step: stepped ? ("start" as const) : undefined,
        lineStyle: { width: lineWidth },
        showSymbol: showPoints,
        areaStyle: area ? {} : undefined,
        emphasis: seriesKeys.length > 1 ? { focus: "series" as const } : {},
      })),
    };
  }, [data, xAxisLabel, yAxisLabel, smooth, area, showLegend, showPoints, lineWidth, showGridLines, stepped, compact, hideLegend]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart options={options} {...rest} />
    </div>
  );
}

export { LineChart };
