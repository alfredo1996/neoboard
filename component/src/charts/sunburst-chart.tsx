import { useMemo } from "react";
import * as echarts from "echarts/core";
import { SunburstChart as ESunburstChart } from "echarts/charts";
import { TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import { resolveItemColor } from "./chart-utils";
import type { StylingRule } from "./styling-rule";

echarts.use([ESunburstChart, TitleComponent, TooltipComponent, CanvasRenderer]);

export interface SunburstDataItem {
  name: string;
  value?: number;
  children?: SunburstDataItem[];
}

export interface SunburstChartProps extends Omit<BaseChartProps, "options"> {
  /** Hierarchical data for the sunburst chart */
  data: SunburstDataItem[];
  /** Show segment labels */
  showLabels?: boolean;
  /** Sort order for segments */
  sort?: "desc" | "asc" | "none";
  /** Highlight segments on hover */
  highlightOnHover?: boolean;
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
}

/**
 * Sunburst chart for displaying hierarchical data as nested arcs.
 * Accepts `data` as a tree: `[{ name, value, children: [...] }]`.
 */
function SunburstChart({
  data,
  showLabels = true,
  sort = "desc",
  highlightOnHover = true,
  stylingRules,
  paramValues,
  ...rest
}: SunburstChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const compact = width > 0 && (width < 250 || height < 200);

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

    // Sort function for echarts sunburst
    const sortFn = sort === "none" ? null : sort === "asc" ? "asc" : "desc";

    return {
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const p = params as { name: string; value: unknown };
          return `${p.name}: ${p.value ?? ""}`;
        },
      },
      series: [
        {
          type: "sunburst",
          data: stylingRules?.length
            ? data.map((item) => ({
                ...item,
                itemStyle: {
                  ...((item as { itemStyle?: Record<string, unknown> }).itemStyle ?? {}),
                  ...(resolveItemColor(
                    typeof item.value === "number" ? item.value : 0,
                    stylingRules,
                    paramValues,
                    [],
                  )
                    ? { color: resolveItemColor(typeof item.value === "number" ? item.value : 0, stylingRules, paramValues, []) }
                    : {}),
                },
              }))
            : data,
          radius: compact ? ["0%", "90%"] : ["0%", "80%"],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sort: sortFn as any,
          label: {
            show: showLabels && !compact,
            rotate: "radial",
            minAngle: 5,
            overflow: "truncate",
          },
          emphasis: highlightOnHover
            ? {
                focus: "ancestor",
                itemStyle: {
                  shadowBlur: 10,
                  shadowOffsetX: 0,
                  shadowColor: "rgba(0, 0, 0, 0.5)",
                },
              }
            : {},
          levels: [
            {},
            { r0: "15%", r: "35%", itemStyle: { borderWidth: 2 }, label: { rotate: "tangential" } },
            { r0: "35%", r: "55%", label: { align: "right" } },
            { r0: "55%", r: "75%", label: { position: "outside", padding: 3, silent: false } },
          ],
        },
      ],
    };
  }, [data, showLabels, sort, highlightOnHover, compact, stylingRules, paramValues]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart options={options} {...rest} />
    </div>
  );
}

export { SunburstChart };
