import { useMemo } from "react";
import * as echarts from "echarts/core";
import { GaugeChart as EGaugeChart } from "echarts/charts";
import { TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import { resolveItemColor } from "./chart-utils";
import type { StylingRule } from "./styling-rule";

echarts.use([EGaugeChart, TitleComponent, TooltipComponent, CanvasRenderer]);

export interface GaugeDataPoint {
  value: number;
  name?: string;
}

export interface GaugeChartProps extends Omit<BaseChartProps, "options"> {
  /** Array with a single gauge data point: [{ value, name }] */
  data: GaugeDataPoint[];
  /** Minimum value on the gauge scale */
  min?: number;
  /** Maximum value on the gauge scale */
  max?: number;
  /** Show progress arc filling */
  showProgress?: boolean;
  /** Show the needle pointer */
  showPointer?: boolean;
  /** Show the numeric value and name detail */
  showDetail?: boolean;
  /** Start angle in degrees (0 = 3 o'clock) */
  startAngle?: number;
  /** End angle in degrees */
  endAngle?: number;
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
}

/**
 * Gauge chart for displaying a single value on a dial.
 * Accepts `data` as `[{ value, name }]`.
 *
 * Adapts to container size:
 * - Below 200px: hides label detail for a compact view.
 */
function GaugeChart({
  data,
  min = 0,
  max = 100,
  showProgress = true,
  showPointer = true,
  showDetail = true,
  startAngle = 225,
  endAngle = -45,
  stylingRules,
  paramValues,
  ...rest
}: GaugeChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const compact = width > 0 && (width < 200 || height < 200);

  const options = useMemo((): EChartsOption => {
    if (!data.length) {
      return {
        title: {
          text: "No data",
          left: "center",
          top: "center",
          textStyle: { color: "#999", fontSize: 14 },
        },
      };
    }

    const point = data[0];

    return {
      tooltip: {
        formatter: "{b}: {c}",
      },
      series: [
        {
          type: "gauge",
          min,
          max,
          startAngle,
          endAngle,
          progress: {
            show: showProgress,
            width: compact ? 8 : 12,
          },
          pointer: {
            show: showPointer,
            length: "60%",
            width: compact ? 4 : 6,
          },
          axisLine: {
            lineStyle: {
              width: compact ? 8 : 12,
            },
          },
          axisTick: {
            show: !compact,
            distance: compact ? 0 : -15,
            splitNumber: 2,
            length: 8,
            lineStyle: { width: 2 },
          },
          splitLine: {
            show: !compact,
            distance: compact ? 0 : -25,
            length: compact ? 10 : 15,
            lineStyle: { width: 3 },
          },
          axisLabel: {
            show: !compact,
            distance: compact ? 0 : 35,
            fontSize: 12,
          },
          detail: {
            show: showDetail && !compact,
            valueAnimation: true,
            fontSize: 20,
            formatter: "{value}",
            offsetCenter: [0, "70%"],
          },
          title: {
            show: showDetail && !compact,
            offsetCenter: [0, "90%"],
            fontSize: 14,
          },
          data: [
            {
              value: point.value,
              name: point.name ?? "",
              ...(resolveItemColor(point.value, stylingRules, paramValues, [])
                ? {
                    itemStyle: {
                      color: resolveItemColor(point.value, stylingRules, paramValues, []),
                    },
                  }
                : {}),
            },
          ],
        },
      ],
    };
  }, [data, min, max, startAngle, endAngle, showProgress, showPointer, showDetail, compact, stylingRules, paramValues]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart options={options} {...rest} />
    </div>
  );
}

export { GaugeChart };
