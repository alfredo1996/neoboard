import { useMemo } from "react";
import * as echarts from "echarts/core";
import { GaugeChart as EGaugeChart } from "echarts/charts";
import { TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import {
  buildEmptyDataOption,
  resolveItemColor,
  parseGaugeThresholdZones,
} from "./chart-utils";
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
  /** JSON string of threshold zones: [{ value, color }] */
  thresholdZones?: string;
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
  thresholdZones: thresholdZonesJson,
  stylingRules,
  paramValues,
  ...rest
}: GaugeChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const measured = width > 0;
  const compact = measured && (width < 200 || height < 200);

  const options = useMemo((): EChartsOption | undefined => {
    // Defer rendering until the container has been measured to prevent
    // a flash of tick marks / axis labels with incorrect sizing.
    if (!measured) return undefined;
    if (!data.length) return buildEmptyDataOption();

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
            width: compact ? 10 : 16,
            roundCap: true,
          },
          pointer: {
            show: showPointer,
            length: "55%",
            width: compact ? 4 : 6,
            itemStyle: { color: "auto" },
          },
          axisLine: {
            roundCap: true,
            lineStyle: {
              width: compact ? 10 : 16,
              color: parseGaugeThresholdZones(
                thresholdZonesJson,
                min,
                max,
              ) as never,
            },
          },
          axisTick: {
            show: !compact,
            distance: compact ? 0 : -20,
            splitNumber: 2,
            length: 6,
            lineStyle: { width: 1.5, color: "#999" },
          },
          splitLine: {
            show: !compact,
            distance: compact ? 0 : -20,
            length: compact ? 8 : 12,
            lineStyle: { width: 2, color: "#999" },
          },
          axisLabel: {
            show: !compact,
            distance: compact ? 0 : 30,
            fontSize: 11,
            color: "#999",
          },
          anchor: {
            show: showPointer && !compact,
            size: 12,
            showAbove: true,
            itemStyle: { borderWidth: 3, borderColor: "#999" },
          },
          detail: {
            show: showDetail,
            valueAnimation: true,
            fontSize: compact ? 18 : 28,
            fontWeight: "bold",
            formatter: "{value}",
            offsetCenter: [0, showPointer ? "70%" : "0%"],
            color: "auto",
          },
          title: {
            show: showDetail && !compact,
            offsetCenter: [0, showPointer ? "90%" : "25%"],
            fontSize: 13,
            color: "#999",
          },
          animationDuration: 1000,
          animationEasingUpdate: "cubicOut",
          data: (() => {
            const resolvedColor = resolveItemColor(
              point.value,
              stylingRules,
              paramValues,
            );
            return [
              {
                value: point.value,
                name: point.name ?? "",
                ...(resolvedColor
                  ? { itemStyle: { color: resolvedColor } }
                  : {}),
              },
            ];
          })(),
        },
      ],
    };
  }, [
    measured,
    data,
    min,
    max,
    startAngle,
    endAngle,
    showProgress,
    showPointer,
    showDetail,
    thresholdZonesJson,
    compact,
    stylingRules,
    paramValues,
  ]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart options={options} {...rest} />
    </div>
  );
}

export { GaugeChart };
