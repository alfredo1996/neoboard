import { useMemo } from "react";
import * as echarts from "echarts/core";
import { RadarChart as ERadarChart } from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { BaseChart, useDarkMode } from "./base-chart";
import type { BaseChartProps } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import { buildEmptyDataOption, resolveItemColor } from "./chart-utils";
import type { StylingRule } from "./styling-rule";

echarts.use([
  ERadarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

export interface RadarIndicator {
  name: string;
  max: number;
}

export interface RadarSeries {
  name: string;
  /**
   * `null` = that axis was not measured for this series. ECharts plots it at
   * the radar centre (`radarLayout.js` getValueMissingPoint) — with min-0
   * indicators that is where a zero lands too, so the canvas position is not
   * the point. What changes is that the tooltip reads "-" instead of a
   * fabricated "0", the value label is blank rather than "null", and the
   * styling-rule mean below skips it (#1655).
   */
  values: (number | null)[];
}

export interface RadarChartData {
  indicators: RadarIndicator[];
  series: RadarSeries[];
}

export interface RadarChartProps extends Omit<BaseChartProps, "options"> {
  /** Radar data with indicators and series */
  data: RadarChartData;
  /** Shape of the radar grid */
  shape?: "polygon" | "circle";
  /** Fill the radar polygon area */
  filled?: boolean;
  /** Show legend */
  showLegend?: boolean;
  /** Show values at data points */
  showValues?: boolean;
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
}

/**
 * Radar chart for comparing multiple metrics across categories.
 * Accepts `data` as `{ indicators: [{ name, max }], series: [{ name, values: [] }] }`.
 *
 * Adapts to container size:
 * - Below 300px: hides legend
 */
function RadarChart({
  data,
  shape = "polygon",
  filled = true,
  showLegend = true,
  showValues = false,
  stylingRules,
  paramValues,
  ariaDescription,
  ...rest
}: RadarChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const compact = width > 0 && (width < 300 || height < 200);
  const hideLegend = width > 0 && height < 200;

  // The empty-state colour comes from the theme, so this memo has to
  // rebuild on a toggle — a DOM read inside it froze at mount (#1286).
  const dark = useDarkMode();

  const options = useMemo((): EChartsOption => {
    if (!data.indicators.length || !data.series.length)
      return buildEmptyDataOption(dark);

    const effectiveShowLegend =
      hideLegend || compact ? false : showLegend && data.series.length > 1;

    return {
      tooltip: {
        trigger: "item",
      },
      legend: effectiveShowLegend
        ? { bottom: 0, data: data.series.map((s) => s.name) }
        : undefined,
      radar: {
        shape,
        indicator: data.indicators,
        radius: compact ? "70%" : "65%",
        center: effectiveShowLegend ? ["50%", "45%"] : ["50%", "50%"],
        // Text color intentionally omitted — picked up from theme.textStyle.color.
        splitArea: {
          show: true,
          areaStyle: {
            color: ["rgba(128,128,128,0.04)", "rgba(128,128,128,0.08)"],
          },
        },
        splitLine: { lineStyle: { color: "rgba(128,128,128,0.2)" } },
      },
      series: [
        {
          type: "radar",
          data: data.series.map((s) => {
            // Mean of the axes that actually HAVE a value. `sum + null` is
            // `sum + 0` in JS, so an unmeasured axis dragged the mean toward
            // zero and fired a `< threshold` rule on data nobody measured
            // (#1655). An all-null series has no mean at all — pass null
            // through so only is_null / is_not_null can match it.
            const measured = s.values.filter(
              (v): v is number => typeof v === "number",
            );
            const seriesColor = resolveItemColor(
              measured.length
                ? measured.reduce((sum, v) => sum + v, 0) / measured.length
                : null,
              stylingRules,
              paramValues,
            );
            return {
              name: s.name,
              value: s.values,
              label: showValues
                ? {
                    show: true,
                    // Per-axis scalar, not the whole array. Guarded because
                    // steps 9-15 are what first put a null in here, and
                    // String(null) would paint the literal text "null" on an
                    // axis nobody measured (#1655).
                    formatter: (params: unknown) => {
                      const v = (params as { value: unknown }).value;
                      return v == null ? "" : String(v);
                    },
                  }
                : { show: false },
              areaStyle: filled
                ? {
                    opacity: 0.15,
                    ...(seriesColor ? { color: seriesColor } : {}),
                  }
                : undefined,
              lineStyle: seriesColor ? { color: seriesColor } : undefined,
              itemStyle: seriesColor ? { color: seriesColor } : undefined,
            };
          }),
          emphasis: {
            lineStyle: { width: 4 },
          },
        },
      ],
    };
  }, [
    data,
    shape,
    filled,
    showLegend,
    showValues,
    compact,
    hideLegend,
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
          `Radar chart comparing ${data.series.length} series across ${data.indicators.length} axes`
        }
        {...rest}
      />
    </div>
  );
}

export { RadarChart };
