import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps, LineChartDataPoint } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import {
  buildAutoAriaDescription,
  buildEmptyDataOption,
  getCompactState,
  resolveShowLegend,
  buildCompactGrid,
  buildLegend,
  resolveLegendPosition,
  resolveItemColor,
  buildTooltipFormatter,
  parseReferenceLines,
  buildMarkLineFromRefs,
  isTimeSeriesData,
  fadeToTransparent,
  isDark,
} from "./chart-utils";
import type { StylingRule } from "./styling-rule";

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
  /** Where to place the legend (#1053). */
  legendPosition?: string;
  /** Show data point markers */
  showPoints?: boolean;
  /** Line stroke width in pixels */
  lineWidth?: number;
  /** Show grid lines */
  showGridLines?: boolean;
  /** Use stepped line style */
  stepped?: boolean;
  /** Draw lines through missing (null) data points */
  connectNulls?: boolean;
  /** Show series name label at the end of each line */
  endLabel?: boolean;
  /** JSON string of reference lines: [{ value, label?, color? }] */
  referenceLines?: string;
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
  /**
   * Series names to render on a secondary (right) Y-axis. When non-empty,
   * the chart renders two independent Y-axes so series with different
   * scales can share the same chart.
   */
  rightAxisSeries?: string[];
  /** Right Y-axis label (used when rightAxisSeries is non-empty) */
  rightYAxisLabel?: string;
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
/**
 * Collect series keys (every non-"x" column) in first-seen order across rows.
 * Lifted out of the options builder so the memo body stays under the
 * cognitive-complexity budget.
 */
function collectSeriesKeys(data: LineChartDataPoint[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const row of data) {
    for (const k of Object.keys(row)) {
      if (k !== "x" && !seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }
  return keys;
}

/** Find the most recent numeric value for `key`, scanning from the tail. */
function findLastNumericValue(
  data: LineChartDataPoint[],
  key: string,
): number | undefined {
  for (let i = data.length - 1; i >= 0; i -= 1) {
    const candidate = data[i][key];
    if (typeof candidate === "number") return candidate;
  }
  return undefined;
}

function LineChart({
  data,
  xAxisLabel,
  yAxisLabel,
  // v1.1 defaults (#822): smooth fine lines with a subtle area fill make
  // charts look deliberately styled out of the box. Both opt-outable.
  smooth = true,
  area = true,
  showLegend,
  legendPosition,
  showPoints = false,
  lineWidth = 1.5,
  showGridLines = true,
  stepped = false,
  connectNulls = false,
  endLabel = false,
  referenceLines: referenceLinesJson,
  stylingRules,
  paramValues,
  rightAxisSeries,
  rightYAxisLabel,
  ariaDescription,
  samplingThreshold = 1000,
  samplingMethod = "lttb",
  ...rest
}: LineChartProps & { samplingThreshold?: number; samplingMethod?: string }) {
  const { width, height, containerRef } = useContainerSize();
  const { compact, hideLegend } = getCompactState(width, height);

  const options = useMemo((): EChartsOption => {
    if (!data.length) return buildEmptyDataOption();

    const seriesKeys = collectSeriesKeys(data);
    const effectiveShowLegend = resolveShowLegend(
      showLegend,
      seriesKeys.length,
      hideLegend,
    );
    const legendPos = resolveLegendPosition(legendPosition);
    const markLine = buildMarkLineFromRefs(
      parseReferenceLines(referenceLinesJson),
    );
    const xValues = data.map((d) => d.x);
    const useTimeAxis = isTimeSeriesData(xValues);
    const rightAxisSet = new Set(rightAxisSeries ?? []);
    const useDualAxis = rightAxisSet.size > 0;
    const useSampling =
      samplingThreshold > 0 && data.length > samplingThreshold;

    const leftYAxis = {
      type: "value" as const,
      name: compact ? undefined : yAxisLabel,
      nameLocation: "middle" as const,
      nameGap: 50,
      axisLabel: { show: !compact },
      splitLine: { show: showGridLines },
    };
    const rightYAxis = {
      type: "value" as const,
      name: compact ? undefined : rightYAxisLabel,
      nameLocation: "middle" as const,
      nameGap: 50,
      axisLabel: { show: !compact },
      // Only the left axis draws grid split lines to avoid visual clutter
      splitLine: { show: false },
    };

    const buildSeries = (key: string, idx: number) => {
      const lastValue = findLastNumericValue(data, key);
      const seriesColor =
        lastValue !== undefined
          ? resolveItemColor(lastValue, stylingRules, paramValues)
          : undefined;
      return {
        name: key,
        type: "line" as const,
        yAxisIndex: useDualAxis && rightAxisSet.has(key) ? 1 : 0,
        data: useTimeAxis
          ? data.map((d) => [d.x, d[key]])
          : data.map((d) => d[key] as number),
        smooth,
        step: stepped ? ("start" as const) : undefined,
        connectNulls,
        endLabel: endLabel ? { show: true, formatter: "{a}" } : undefined,
        lineStyle: { width: lineWidth, color: seriesColor },
        itemStyle: seriesColor ? { color: seriesColor } : undefined,
        showSymbol: showPoints,
        // Subtle fill (#822): a soft gradient when the series color is
        // known, otherwise a low flat opacity (ECharts applies the series
        // color automatically).
        // No area fill in dark mode at all (#1264). A warm fill over charcoal
        // composites to brown at ANY alpha — the technique is the problem, not
        // the value. #1244 lowered the opacity (0.15 -> 0.06) and it still read
        // as a stain, so dark keeps the line and drops the wash. The fill is a
        // light-mode affordance only, which is why the opacities below are no
        // longer theme-dependent.
        areaStyle:
          area && !isDark()
            ? seriesColor
              ? {
                  opacity: 0.15,
                  color: {
                    type: "linear" as const,
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                      { offset: 0, color: seriesColor },
                      // Fade to the SAME colour transparent — fading to
                      // transparent white washed through pale grey (#1244).
                      { offset: 1, color: fadeToTransparent(seriesColor) },
                    ],
                  },
                }
              : // Flat fill, no gradient: ECharts applies the series colour
                // itself here because no styling rule resolved one.
                { opacity: 0.12 }
            : undefined,
        emphasis: seriesKeys.length > 1 ? { focus: "series" as const } : {},
        // LTTB downsampling for large datasets
        ...(useSampling
          ? { sampling: samplingMethod as "lttb" | "average" | "max" | "min" }
          : {}),
        // Attach reference lines to the first series only
        ...(idx === 0 && markLine ? { markLine } : {}),
      };
    };

    return {
      tooltip: { trigger: "axis", formatter: buildTooltipFormatter() },
      legend: buildLegend(effectiveShowLegend, legendPos),
      grid: {
        ...buildCompactGrid(compact, effectiveShowLegend, legendPos),
        // Keep room for the y-axis labels, plus extra when a side legend sits
        // on that edge (#1053).
        left: (compact ? 8 : 48) + (legendPos === "left" ? 40 : 0),
        right:
          (useDualAxis && !compact ? 56 : 0) +
            (legendPos === "right" ? 40 : 0) || undefined,
      },
      xAxis: {
        type: useTimeAxis ? "time" : "category",
        ...(useTimeAxis ? {} : { data: xValues.map(String) }),
        name: compact ? undefined : xAxisLabel,
        nameLocation: "middle",
        nameGap: 30,
        axisLabel: { show: !compact },
      },
      yAxis: useDualAxis ? [leftYAxis, rightYAxis] : leftYAxis,
      series: seriesKeys.map((key, idx) => buildSeries(key, idx)),
    };
  }, [
    data,
    xAxisLabel,
    yAxisLabel,
    smooth,
    area,
    showLegend,
    showPoints,
    lineWidth,
    showGridLines,
    stepped,
    connectNulls,
    endLabel,
    referenceLinesJson,
    stylingRules,
    paramValues,
    rightAxisSeries,
    rightYAxisLabel,
    compact,
    hideLegend,
    samplingThreshold,
    samplingMethod,
  ]);

  // Auto-derive a screen-reader description from the data shape so the
  // generic "Chart visualization" fallback is only used when the chart is
  // truly empty. Callers can still pass an explicit ariaDescription to
  // override (e.g., a widget title that already conveys the meaning).
  const effectiveAria =
    ariaDescription ??
    buildAutoAriaDescription("Line chart", data, "x", "points");

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart options={options} {...rest} ariaDescription={effectiveAria} />
    </div>
  );
}

export { LineChart };
