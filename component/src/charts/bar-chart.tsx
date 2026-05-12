import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps, BarChartDataPoint } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import {
  buildEmptyDataOption,
  getCompactState,
  resolveShowLegend,
  buildCompactGrid,
  resolveItemColor,
  buildTooltipFormatter,
  buildPercentTooltipFormatter,
  buildCategoryAxisLabel,
  parseReferenceLines,
  buildMarkLineFromRefs,
} from "./chart-utils";
import type { StylingRule } from "./styling-rule";

export type BarStackMode = "none" | "stacked" | "percent";

export interface BarChartProps extends Omit<BaseChartProps, "options"> {
  /** Array of data points. Each object has a `label` key and one or more numeric series keys. */
  data: BarChartDataPoint[];
  /** Bar orientation */
  orientation?: "vertical" | "horizontal";
  /** Stack mode: none (grouped), stacked (absolute), percent (100% stacked) */
  stackMode?: BarStackMode;
  /** @deprecated Use stackMode instead. Stack bars when multiple series */
  stacked?: boolean;
  /** Show values on bars */
  showValues?: boolean;
  /** Show legend (auto-shown when multiple series) */
  showLegend?: boolean;
  /** Bar width in pixels; 0 means auto */
  barWidth?: number;
  /** Gap between bars in a group (e.g. "30%") */
  barGap?: string;
  /** Show Y-axis grid lines */
  showGridLines?: boolean;
  /** X-axis name label */
  xAxisLabel?: string;
  /** Y-axis name label */
  yAxisLabel?: string;
  /** Override axis label rotation angle (0-90). Omit for automatic. */
  axisLabelRotation?: number;
  /** JSON string of reference lines: [{ value, label?, color? }] */
  referenceLines?: string;
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
}

/**
 * Bar chart for categorical comparisons.
 * Accepts `data` as `Array<{ label, value }>` for single series
 * or `Array<{ label, series1, series2 }>` for grouped/stacked bars.
 *
 * Adapts to container size:
 * - Below 300px wide: hides value labels and axis labels, tightens grid
 * - Below 200px tall: hides legend
 */
function BarChart({
  data,
  orientation = "vertical",
  stackMode: stackModeProp,
  stacked = false,
  showValues = false,
  showLegend,
  barWidth = 0,
  barGap = "30%",
  showGridLines = true,
  xAxisLabel,
  yAxisLabel,
  axisLabelRotation,
  referenceLines: referenceLinesJson,
  stylingRules,
  paramValues,
  ...rest
}: BarChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const { compact, hideLegend } = getCompactState(width, height);

  // Resolve stack mode: prefer explicit stackMode, fall back to legacy boolean
  const stackMode: BarStackMode =
    stackModeProp ?? (stacked ? "stacked" : "none");
  const isPercent = stackMode === "percent";
  const isStacked = stackMode === "stacked" || isPercent;

  const options = useMemo((): EChartsOption => {
    if (!data.length) return buildEmptyDataOption();

    const seriesKeys = Object.keys(data[0]).filter((k) => k !== "label");

    // Pre-compute row totals for percentage normalization
    const rowTotals = isPercent
      ? data.map((d) =>
          seriesKeys.reduce((sum, key) => {
            const v = Number(d[key]);
            return sum + (Number.isFinite(v) ? Math.abs(v) : 0);
          }, 0),
        )
      : [];
    const effectiveShowLegend = resolveShowLegend(
      showLegend,
      seriesKeys.length,
      hideLegend,
    );
    const isHorizontal = orientation === "horizontal";
    const effectiveShowValues = compact ? false : showValues;
    const effectiveBarWidth = barWidth > 0 ? barWidth : undefined;
    // Legacy colorThresholds removed — styling is now handled exclusively
    // via stylingRules (migrated at the card-container level).
    const refLines = parseReferenceLines(referenceLinesJson);
    const markLine = buildMarkLineFromRefs(refLines);

    const categoryLabels = data.map((d) => d.label);
    const axisLabelConfig = buildCategoryAxisLabel(categoryLabels.length, {
      compact,
      rotateOverride: axisLabelRotation,
      containerWidth: width,
    });

    const categoryAxis = {
      type: "category" as const,
      data: categoryLabels,
      axisLabel: axisLabelConfig,
      axisPointer: { type: "shadow" as const },
      name: compact ? undefined : isHorizontal ? yAxisLabel : xAxisLabel,
      nameLocation: "middle" as const,
      nameGap: axisLabelConfig.rotate > 0 ? 50 : 30,
    };
    const valueAxis = {
      type: "value" as const,
      axisLabel: {
        show: !compact,
        ...(isPercent ? { formatter: "{value}%" } : {}),
      },
      splitLine: { show: showGridLines },
      name: compact ? undefined : isHorizontal ? xAxisLabel : yAxisLabel,
      nameLocation: "middle" as const,
      nameGap: 50,
      ...(isPercent ? { max: 100 } : {}),
    };

    return {
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        formatter: isPercent
          ? buildPercentTooltipFormatter(seriesKeys, data)
          : buildTooltipFormatter(),
      },
      legend: effectiveShowLegend ? { bottom: 0 } : undefined,
      grid: buildCompactGrid(compact, effectiveShowLegend),
      xAxis: isHorizontal ? valueAxis : categoryAxis,
      yAxis: isHorizontal ? categoryAxis : valueAxis,
      series: seriesKeys.map((key, idx) => ({
        name: key,
        type: "bar" as const,
        data: data.map((d, rowIdx) => {
          const rawValue = d[key];
          const numericValue =
            typeof rawValue === "number" ? rawValue : Number(rawValue);

          // In percent mode, normalize to percentage of row total
          let displayValue = rawValue as number | string;
          if (isPercent) {
            const total = rowTotals[rowIdx];
            displayValue =
              total > 0 && Number.isFinite(numericValue)
                ? Math.round((numericValue / total) * 10000) / 100
                : 0;
          }

          const color = Number.isFinite(numericValue)
            ? resolveItemColor(numericValue, stylingRules, paramValues)
            : undefined;
          return color
            ? { value: displayValue, itemStyle: { color } }
            : displayValue;
        }),
        stack: isStacked ? "total" : undefined,
        barWidth: effectiveBarWidth,
        barGap,
        label: effectiveShowValues
          ? {
              show: true,
              position: isHorizontal ? ("right" as const) : ("top" as const),
            }
          : undefined,
        emphasis: seriesKeys.length > 1 ? { focus: "series" as const } : {},
        // Attach reference lines to the first series only
        ...(idx === 0 && markLine ? { markLine } : {}),
      })),
    };
  }, [
    data,
    orientation,
    isStacked,
    isPercent,
    showValues,
    showLegend,
    barWidth,
    barGap,
    showGridLines,
    xAxisLabel,
    yAxisLabel,
    axisLabelRotation,
    referenceLinesJson,
    stylingRules,
    paramValues,
    compact,
    hideLegend,
  ]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart options={options} {...rest} />
    </div>
  );
}

export { BarChart };
