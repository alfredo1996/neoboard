import { useMemo } from "react";
import * as echarts from "echarts/core";
import { GaugeChart as EGaugeChart } from "echarts/charts";
import { TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption, GaugeSeriesOption } from "echarts";
import { BaseChart, useDarkMode } from "./base-chart";
import type { BaseChartProps } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import {
  buildEmptyDataOption,
  escapeHtml,
  formatNumber,
  resolveItemColor,
  parseGaugeThresholdZones,
} from "./chart-utils";
import {
  HASTINGS_LIGHT,
  HASTINGS_DARK,
  TODAY_LINE_COLOR,
  TRACK_COLOR,
} from "./theme";
import type { StylingRule } from "./styling-rule";

// Room each side of the arc for an end label such as "1,000,000", in px.
const LABEL_ROOM = 50;

// Half the width of a threshold tick, as a share of the arc. Two zones closer
// than twice this (0.8%) would overlap, so the later tick is skipped.
const TICK_HALF = 0.004;

/** The value as the face prints it: one decimal, with the author's prefix and suffix. */
const faceText = (v: number, prefix?: string, suffix?: string) =>
  formatNumber(v, { numberFormat: "comma", decimalPlaces: 1, prefix, suffix });

/** A transparent arc with one thin coloured tick at the end of each zone. */
function zoneTicks(zones: [number, string][]): [number, string][] {
  const stops: [number, string][] = [];
  let last = 0;
  for (const [stop, color] of [...zones].sort((a, b) => a[0] - b[0])) {
    if (stop <= last + TICK_HALF || stop >= 1) continue;
    stops.push([stop - TICK_HALF, "transparent"], [stop + TICK_HALF, color]);
    last = stop + TICK_HALF;
  }
  stops.push([1, "transparent"]);
  return stops;
}

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
  /** Prefix before the value (e.g. "$") */
  prefix?: string;
  /** Suffix after the value (e.g. "%") */
  suffix?: string;
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
  startAngle = 180,
  endAngle = 0,
  thresholdZones: thresholdZonesJson,
  prefix,
  suffix,
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
    if (!data.length) return buildEmptyDataOption(dark);

    const point = data[0];
    const arcWidth = compact ? 10 : 12;
    // "100%" is half the shorter side. The end labels sit LABEL_ROOM outside
    // the arc, so on a squarer card the arc shrinks until they fit.
    const radius =
      compact || width / 2 - LABEL_ROOM >= Math.min(width, height) / 2
        ? "100%"
        : Math.max(20, width / 2 - LABEL_ROOM);

    // The half circle sits low in the card; a sweep past 180 degrees reaches
    // below its centre, so it is centred higher or its bottom clips.
    const center: [string, string] = [
      "50%",
      startAngle - endAngle > 180 ? "55%" : "78%",
    ];

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
    // Default to the Hastings citrine (#2226), not the stock ECharts blue.
    const progressColor =
      resolvedColor ??
      thresholdColor ??
      (dark ? HASTINGS_DARK[0] : HASTINGS_LIGHT[0]);

    const mode = dark ? "dark" : "light";
    const trackColor = [[1, TRACK_COLOR[mode]]] as never;
    const main: GaugeSeriesOption = {
      type: "gauge",
      min,
      max,
      startAngle,
      endAngle,
      radius,
      center,
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
      // Min and max at the ends of the arc.
      splitNumber: 1,
      axisLabel: {
        show: !compact,
        distance: -40,
        color: TODAY_LINE_COLOR[mode],
        fontSize: 11,
        formatter: (v: number) => formatNumber(v, { numberFormat: "comma" }),
      },
      anchor: {
        show: false,
      },
      detail: {
        show: showDetail,
        valueAnimation: true,
        fontSize: compact ? 18 : 32,
        fontWeight: 600,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        formatter: (v: number) => faceText(v, prefix, suffix),
        offsetCenter: [0, "-22%"],
      },
      title: {
        show: showDetail && !compact,
        offsetCenter: [0, "2%"],
        fontSize: compact ? 11 : 14,
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
    };
    const ticksSeries: GaugeSeriesOption = {
      type: "gauge",
      min,
      max,
      startAngle,
      endAngle,
      radius,
      center,
      silent: true,
      z: 3,
      progress: { show: false },
      pointer: { show: false },
      anchor: { show: false },
      axisLine: {
        lineStyle: { width: arcWidth, color: zoneTicks(thresholdZones) },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: { show: false },
      title: { show: false },
      data: [{ value: point.value }],
    };
    return {
      tooltip: {
        formatter: (params) => {
          const p = params as { name?: string; value?: unknown };
          return escapeHtml(
            `${p.name ?? ""}: ${faceText(Number(p.value), prefix, suffix)}`,
          );
        },
      },
      series: [main, ...(hasCustomZones ? [ticksSeries] : [])],
    };
  }, [
    measured,
    width,
    height,
    data,
    min,
    max,
    startAngle,
    endAngle,
    showProgress,
    showDetail,
    thresholdZonesJson,
    prefix,
    suffix,
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
          `Gauge showing ${faceText(data[0]?.value ?? 0, prefix, suffix)} of ${min} to ${max}`
        }
        {...rest}
      />
    </div>
  );
}

export { GaugeChart };
