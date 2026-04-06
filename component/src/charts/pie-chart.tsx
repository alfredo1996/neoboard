import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps, PieChartDataPoint } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import {
  buildEmptyDataOption,
  getCompactState,
  isDark,
  resolveItemColor,
  groupTopN,
} from "./chart-utils";
import { parseColorThresholds } from "./color-threshold";
import type { StylingRule } from "./styling-rule";

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
  /** Group slices beyond top N into "Other". 0 = show all. */
  topN?: number;
  /** Text shown in the center of a donut chart (e.g. total value). Empty = auto-total. */
  donutCenterText?: string;
  /** @deprecated Use stylingRules instead. JSON string of thresholds */
  colorThresholds?: string;
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
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
  topN = 0,
  donutCenterText,
  colorThresholds,
  stylingRules,
  paramValues,
  ...rest
}: PieChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const compact = width > 0 && (width < 300 || height < 200);
  const { hideLegend } = getCompactState(width, height);

  // EChartsOption from modular imports may not include 'graphic' —
  // we use GraphicComponent which extends the option type at runtime.
  const options = useMemo((): EChartsOption & { graphic?: unknown } => {
    if (!data.length) return buildEmptyDataOption();

    const effectiveShowLabel = compact ? false : showLabel;
    const effectiveShowLegend = hideLegend ? false : showLegend;

    const sorted = sortSlices
      ? [...data].sort((a, b) => b.value - a.value)
      : data;
    const sortedData = groupTopN(sorted, topN);

    const thresholds = stylingRules
      ? []
      : parseColorThresholds(colorThresholds ?? "");
    const coloredData = sortedData.map((d) => {
      const color = resolveItemColor(
        d.value,
        stylingRules,
        paramValues,
        thresholds,
      );
      return color ? { ...d, itemStyle: { color } } : d;
    });

    // Build label formatter based on showPercentage option
    const labelFormatter = showPercentage ? "{b}: {d}%" : "{b}: {c}";

    return {
      tooltip: {
        trigger: "item",
        formatter: "{b}: {c} ({d}%)",
      },
      legend: effectiveShowLegend
        ? {
            bottom: 0,
            type: "scroll",
            orient: "horizontal",
            width: "90%",
            pageIconSize: 12,
            pageTextStyle: { fontSize: 11 },
            pageButtonItemGap: 6,
            itemGap: 12,
            textStyle: { fontSize: 12 },
          }
        : undefined,
      series: [
        {
          type: "pie",
          roseType: roseMode ? ("radius" as const) : undefined,
          radius: donut ? ["40%", "70%"] : "70%",
          center: ["50%", effectiveShowLegend ? "45%" : "50%"],
          data: coloredData,
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
              shadowColor: isDark()
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(0, 0, 0, 0.5)",
            },
          },
        },
      ],
      // Donut center text: show total or custom text in the center hole
      ...(donut && !compact
        ? {
            graphic: [
              {
                type: "text",
                left: "center",
                top: effectiveShowLegend ? "42%" : "47%",
                style: {
                  text:
                    donutCenterText ??
                    String(sortedData.reduce((s, d) => s + d.value, 0)),
                  align: "center",
                  fontSize: 20,
                  fontWeight: "bold",
                  fill: isDark() ? "#e5e5e5" : "#262626",
                },
              },
            ],
          }
        : {}),
    };
  }, [
    data,
    donut,
    showLabel,
    showLegend,
    roseMode,
    labelPosition,
    showPercentage,
    sortSlices,
    topN,
    donutCenterText,
    colorThresholds,
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

export { PieChart };
