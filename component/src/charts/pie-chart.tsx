import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps, PieChartDataPoint } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";

export interface PieChartProps extends Omit<BaseChartProps, "options"> {
  /** Array of `{ name, value }` slices */
  data: PieChartDataPoint[];
  /** Render as a donut chart */
  donut?: boolean;
  /** Show slice labels */
  showLabel?: boolean;
  /** Show legend */
  showLegend?: boolean;
  /** Use nightingale/rose mode (radii vary by value) */
  roseMode?: boolean;
  /** Label position */
  labelPosition?: "outside" | "inside" | "center";
  /** Show percentage in labels */
  showPercentage?: boolean;
  /** Sort slices by value descending */
  sortSlices?: boolean;
}

/**
 * Pie/donut chart for part-to-whole comparisons.
 * Accepts `data` as `Array<{ name, value }>`.
 *
 * Adapts to container size:
 * - Below 300px wide or 200px tall: hides labels (visible on hover)
 * - Below 200px tall: hides legend
 */
function PieChart({
  data,
  donut = false,
  showLabel = true,
  showLegend = true,
  roseMode = false,
  labelPosition = "outside",
  showPercentage = true,
  sortSlices = false,
  ...rest
}: PieChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const compact = width > 0 && (width < 300 || height < 200);
  const hideLegend = width > 0 && height < 200;

  const options = useMemo((): EChartsOption => {
    if (!data.length) {
      return { title: { text: "No data", left: "center", top: "center", textStyle: { color: "#999", fontSize: 14 } } };
    }

    const effectiveShowLabel = compact ? false : showLabel;
    const effectiveShowLegend = hideLegend ? false : showLegend;

    const sortedData = sortSlices
      ? [...data].sort((a, b) => b.value - a.value)
      : data;

    // Build label formatter based on showPercentage option
    const labelFormatter = showPercentage ? "{b}: {d}%" : "{b}: {c}";

    return {
      tooltip: {
        trigger: "item",
        formatter: "{b}: {c} ({d}%)",
      },
      legend: effectiveShowLegend ? { bottom: 0, type: "scroll" } : undefined,
      series: [
        {
          type: "pie",
          roseType: roseMode ? ("radius" as const) : undefined,
          radius: donut ? ["40%", "70%"] : "70%",
          center: ["50%", effectiveShowLegend ? "45%" : "50%"],
          data: sortedData,
          label: {
            show: effectiveShowLabel,
            position: labelPosition,
            formatter: labelFormatter,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: compact ? 12 : 14,
              fontWeight: "bold",
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: "rgba(0, 0, 0, 0.5)",
            },
          },
        },
      ],
    };
  }, [data, donut, showLabel, showLegend, roseMode, labelPosition, showPercentage, sortSlices, compact, hideLegend]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart options={options} {...rest} />
    </div>
  );
}

export { PieChart };
