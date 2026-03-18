import { useMemo } from "react";
import * as echarts from "echarts/core";
import { RadarChart as ERadarChart } from "echarts/charts";
import { TitleComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import { resolveItemColor } from "./chart-utils";
import type { StylingRule } from "./styling-rule";

echarts.use([ERadarChart, TitleComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export interface RadarIndicator {
  name: string;
  max: number;
}

export interface RadarSeries {
  name: string;
  values: number[];
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
  ...rest
}: RadarChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const compact = width > 0 && (width < 300 || height < 200);
  const hideLegend = width > 0 && height < 200;

  const options = useMemo((): EChartsOption => {
    if (!data.indicators.length || !data.series.length) {
      return {
        title: {
          text: "No data",
          left: "center",
          top: "center",
          textStyle: { color: "#999", fontSize: 14 },
        },
      };
    }

    const effectiveShowLegend = (hideLegend || compact) ? false : (showLegend && data.series.length > 1);

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
        radius: compact ? "70%" : "60%",
        center: effectiveShowLegend ? ["50%", "45%"] : ["50%", "50%"],
      },
      series: [
        {
          type: "radar",
          data: data.series.map((s) => {
            const seriesColor = resolveItemColor(
              s.values.reduce((sum, v) => sum + v, 0) / (s.values.length || 1),
              stylingRules,
              paramValues,
              [],
            );
            return {
              name: s.name,
              value: s.values,
              label: showValues
                ? { show: true, formatter: (params: unknown) => String((params as { value: number }).value) }
                : { show: false },
              areaStyle: filled ? { opacity: 0.3, ...(seriesColor ? { color: seriesColor } : {}) } : undefined,
              lineStyle: seriesColor ? { color: seriesColor } : undefined,
              itemStyle: seriesColor ? { color: seriesColor } : undefined,
            };
          }),
          emphasis: {
            lineStyle: { width: 3 },
          },
        },
      ],
    };
  }, [data, shape, filled, showLegend, showValues, compact, hideLegend, stylingRules, paramValues]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart options={options} {...rest} />
    </div>
  );
}

export { RadarChart };
