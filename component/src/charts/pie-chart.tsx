import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps, PieChartDataPoint } from "./types";

export interface PieChartProps extends Omit<BaseChartProps, "options"> {
  /** Array of `{ name, value }` slices */
  data: PieChartDataPoint[];
  /** Render as a donut chart */
  donut?: boolean;
  /** Show slice labels */
  showLabel?: boolean;
  /** Show legend */
  showLegend?: boolean;
}

/**
 * Pie/donut chart for part-to-whole comparisons.
 * Accepts `data` as `Array<{ name, value }>`.
 */
function PieChart({
  data,
  donut = false,
  showLabel = true,
  showLegend = true,
  ...rest
}: PieChartProps) {
  const options = useMemo((): EChartsOption => {
    if (!data.length) {
      return { title: { text: "No data", left: "center", top: "center", textStyle: { color: "#999", fontSize: 14 } } };
    }

    return {
      tooltip: {
        trigger: "item",
        formatter: "{b}: {c} ({d}%)",
      },
      legend: showLegend ? { bottom: 0, type: "scroll" } : undefined,
      series: [
        {
          type: "pie",
          radius: donut ? ["40%", "70%"] : "70%",
          center: ["50%", showLegend ? "45%" : "50%"],
          data,
          label: {
            show: showLabel,
            formatter: "{b}: {d}%",
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: "rgba(0, 0, 0, 0.5)",
            },
          },
        },
      ],
    };
  }, [data, donut, showLabel, showLegend]);

  return <BaseChart options={options} {...rest} />;
}

export { PieChart };
