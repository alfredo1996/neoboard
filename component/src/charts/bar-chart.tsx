import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps, BarChartDataPoint } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import {
  buildAutoAriaDescription,
  getCompactState,
  resolveShowLegend,
  buildCompactGrid,
  buildLegend,
  resolveLegendPosition,
  resolveItemColor,
  buildTooltipFormatter,
  buildPercentTooltipFormatter,
  formatNumber,
  normalizeDecimalPlaces,
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
  /** Fixed decimal places in the tooltip and value labels; -1 or unset = automatic */
  decimalPlaces?: number;
  /** Show legend (auto-shown when multiple series) */
  showLegend?: boolean;
  /** Where to place the legend (#1053). */
  legendPosition?: string;
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
  decimalPlaces,
  showLegend,
  legendPosition,
  barWidth = 0,
  barGap = "30%",
  showGridLines = true,
  xAxisLabel,
  yAxisLabel,
  axisLabelRotation,
  referenceLines: referenceLinesJson,
  stylingRules,
  paramValues,
  ariaDescription,
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
    // ponytail: no empty-data branch here. BarChart renders a DOM empty state
    // and never mounts BaseChart when data is empty (#1053), so the option
    // built on that path was never handed to ECharts. The body below is
    // total over an empty array — it produces an unused option, not a throw.

    // Union keys across every row so sparse data (a series missing from the
    // first row) doesn't get dropped from the chart.
    const seenKeys = new Set<string>();
    const seriesKeys: string[] = [];
    for (const row of data) {
      for (const k of Object.keys(row)) {
        if (k !== "label" && !seenKeys.has(k)) {
          seenKeys.add(k);
          seriesKeys.push(k);
        }
      }
    }

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
    const legendPos = resolveLegendPosition(legendPosition);
    const isHorizontal = orientation === "horizontal";
    const effectiveShowValues = compact ? false : showValues;
    const effectiveBarWidth = barWidth > 0 ? barWidth : undefined;
    // Legacy colorThresholds removed — styling is now handled exclusively
    // via stylingRules (migrated at the card-container level).
    const refLines = parseReferenceLines(referenceLinesJson);
    // The value axis is X when the chart is horizontal — the markLine has to
    // follow the same swap the axes do below (#1548).
    const markLine = buildMarkLineFromRefs(refLines, isHorizontal ? "x" : "y");

    const categoryLabels = data.map((d) => d.label);
    const axisLabelConfig = buildCategoryAxisLabel(categoryLabels.length, {
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

    // Same rounding for the tooltip and the value labels, so a bar never shows
    // one number on the bar and another on hover (#1581). In percent mode the
    // values are percentages, which carry their own precision rule — one
    // decimal, matching the tooltip beside them and pie (#1248, #1587).
    const dp = normalizeDecimalPlaces(decimalPlaces);
    const labelFormatter = (p: { value?: unknown }) => {
      if (typeof p.value !== "number") return String(p.value ?? "");
      return isPercent
        ? p.value.toFixed(1)
        : formatNumber(p.value, { numberFormat: "comma", decimalPlaces: dp });
    };

    return {
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        formatter: isPercent
          ? buildPercentTooltipFormatter(seriesKeys, data)
          : buildTooltipFormatter({ decimalPlaces: dp }),
      },
      legend: buildLegend(effectiveShowLegend, legendPos),
      grid: buildCompactGrid(compact, effectiveShowLegend, legendPos),
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
              formatter: labelFormatter,
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
    decimalPlaces,
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
    // #1546: `width` is read via buildCategoryAxisLabel and `legendPosition`
    // via resolveLegendPosition. Omitting them latched the axis rotation to
    // the width-0 fallback until an unrelated dep changed identity.
    width,
    legendPosition,
  ]);

  // Auto-derive a screen-reader description from the data shape so the
  // generic "Chart visualization" fallback is only used when the chart is
  // truly empty. Callers can still pass an explicit ariaDescription to
  // override (e.g., a widget title that already conveys the meaning).
  const effectiveAria =
    ariaDescription ??
    buildAutoAriaDescription("Bar chart", data, "label", "categories");

  return (
    <div ref={containerRef} className="h-full w-full">
      {data.length === 0 ? (
        // The ECharts "No data" title is canvas-only; render a DOM element so
        // the empty state is visible to screen readers too (#1053).
        <div
          role="status"
          data-testid="bar-chart-empty"
          className="flex h-full w-full items-center justify-center text-sm text-muted-foreground"
        >
          No data
        </div>
      ) : (
        <BaseChart
          options={options}
          {...rest}
          ariaDescription={effectiveAria}
        />
      )}
    </div>
  );
}

export { BarChart };
