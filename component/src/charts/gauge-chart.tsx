import { useMemo } from "react";
import * as echarts from "echarts/core";
import { GaugeChart as EGaugeChart } from "echarts/charts";
import { TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { BaseChart, useDarkMode } from "./base-chart";
import type { BaseChartProps } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import {
  buildEmptyDataOption,
  resolveItemColor,
  parseGaugeThresholdZones,
} from "./chart-utils";
import { CITRINE_LIGHT, CITRINE_DARK } from "./theme";
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
  showDetail = true,
  startAngle = 225,
  endAngle = -45,
  thresholdZones: thresholdZonesJson,
  stylingRules,
  paramValues,
  ariaDescription,
  ...rest
}: GaugeChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const measured = width > 0;
  const compact = measured && (width < 200 || height < 200);
  // Reactive theme so the accent shade rebuilds on toggle. (#chart-review)
  const dark = useDarkMode();

  const options = useMemo((): EChartsOption | undefined => {
    // Defer rendering until the container has been measured to prevent
    // a flash of tick marks / axis labels with incorrect sizing.
    if (!measured) return undefined;
    if (!data.length) return buildEmptyDataOption();

    const point = data[0];
    const arcWidth = compact ? 10 : 18;

    const thresholdZones = parseGaugeThresholdZones(
      thresholdZonesJson,
      min,
      max,
    ) as [number, string][];

    const hasCustomZones =
      thresholdZones.length > 1 ||
      (thresholdZones.length === 1 && thresholdZones[0][0] !== 1);

    const resolvedColor = resolveItemColor(
      point.value,
      stylingRules,
      paramValues,
    );

    // Determine the progress color: styling rule > threshold zone > default accent
    const gaugeSpan = max - min;
    const normalizedValue =
      gaugeSpan > 0
        ? Math.max(0, Math.min(1, (point.value - min) / gaugeSpan))
        : undefined;
    const thresholdColor =
      hasCustomZones && normalizedValue !== undefined
        ? thresholdZones.find(([stop]) => normalizedValue <= stop)?.[1]
        : undefined;
    // Default to the brand citrine accent (chart-1), not the stock ECharts blue.
    const progressColor =
      resolvedColor ??
      thresholdColor ??
      (dark ? CITRINE_DARK[0] : CITRINE_LIGHT[0]);

    // Track color — light gray that works in both themes
    const trackColor = hasCustomZones
      ? (thresholdZones as never)
      : ([[1, "rgba(140, 140, 140, 0.15)"]] as never);

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
          radius: "90%",
          progress: {
            show: showProgress,
            width: arcWidth,
            roundCap: true,
            itemStyle: {
              color: progressColor,
            },
          },
          pointer: {
            show: false,
          },
          axisLine: {
            roundCap: true,
            lineStyle: {
              width: arcWidth,
              color: trackColor,
            },
          },
          axisTick: {
            show: false,
          },
          splitLine: {
            show: false,
          },
          axisLabel: {
            show: false,
          },
          anchor: {
            show: false,
          },
          detail: {
            show: showDetail,
            valueAnimation: true,
            fontSize: compact ? 18 : 36,
            fontWeight: 600,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            formatter: "{value}",
            offsetCenter: [0, "0%"],
          },
          title: {
            show: showDetail && !compact,
            offsetCenter: [0, "22%"],
            fontSize: compact ? 11 : 14,
            color: "rgba(140, 140, 140, 0.8)",
            fontWeight: 400,
          },
          animationDuration: 1000,
          animationEasingUpdate: "cubicOut",
          data: [
            {
              value: point.value,
              name: point.name ?? "",
              ...(resolvedColor ? { itemStyle: { color: resolvedColor } } : {}),
            },
          ],
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
    showDetail,
    thresholdZonesJson,
    compact,
    stylingRules,
    paramValues,
    dark,
  ]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart
        options={options}
        ariaDescription={
          ariaDescription ??
          `Gauge showing ${data[0]?.value ?? 0} of ${min} to ${max}`
        }
        {...rest}
      />
    </div>
  );
}

export { GaugeChart };
