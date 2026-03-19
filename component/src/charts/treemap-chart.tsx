import { useMemo } from "react";
import * as echarts from "echarts/core";
import { TreemapChart as ETreemapChart } from "echarts/charts";
import { TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import { resolveItemColor } from "./chart-utils";
import type { StylingRule } from "./styling-rule";

echarts.use([ETreemapChart, TitleComponent, TooltipComponent, CanvasRenderer]);

export interface TreemapDataItem {
  name: string;
  value?: number;
  children?: TreemapDataItem[];
}

export interface TreemapChartProps extends Omit<BaseChartProps, "options"> {
  /** Hierarchical or flat data for the treemap */
  data: TreemapDataItem[];
  /** Show labels inside rectangles */
  showLabels?: boolean;
  /** Show navigation breadcrumb when drilling into nested data */
  showBreadcrumb?: boolean;
  /** Show numeric values inside rectangles */
  showValues?: boolean;
  /** Color saturation gradient for child items */
  colorSaturation?: "low" | "medium" | "high";
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
}

const COLOR_SATURATION_MAP: Record<string, [number, number]> = {
  low: [0.4, 0.6],
  medium: [0.3, 0.7],
  high: [0.2, 0.8],
};

/**
 * Treemap chart for visualizing hierarchical data as nested rectangles.
 * Accepts `data` as `[{ name, value, children?: [...] }]`.
 *
 * Adapts to container size:
 * - Below 300px: hides breadcrumb and labels
 */
function TreemapChart({
  data,
  showLabels = true,
  showBreadcrumb = true,
  showValues = false,
  colorSaturation = "medium",
  stylingRules,
  paramValues,
  ...rest
}: TreemapChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const compact = width > 0 && (width < 300 || height < 200);

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

    const satRange = COLOR_SATURATION_MAP[colorSaturation];

    return {
      tooltip: {
        formatter: (params: unknown) => {
          const p = params as { name: string; value: unknown; treePathInfo?: Array<{ name: string }> };
          const path = p.treePathInfo?.map((t) => t.name).join(" / ") ?? p.name;
          return `${path}: ${p.value ?? ""}`;
        },
      },
      series: [
        {
          type: "treemap",
          data: stylingRules?.length
            ? data.map((item) => {
                const numericValue = typeof item.value === "number" ? item.value : 0;
                const resolvedColor = resolveItemColor(numericValue, stylingRules, paramValues, []);
                return {
                  ...item,
                  itemStyle: {
                    ...((item as { itemStyle?: Record<string, unknown> }).itemStyle ?? {}),
                    ...(resolvedColor ? { color: resolvedColor } : {}),
                  },
                };
              })
            : data,
          width: "100%",
          height: "100%",
          roam: false,
          breadcrumb: {
            show: showBreadcrumb && !compact,
            bottom: 4,
          },
          label: {
            show: showLabels && !compact,
            position: "insideTopLeft",
            formatter: showValues
              ? "{b}: {c}"
              : "{b}",
          },
          upperLabel: {
            show: true,
            height: 30,
          },
          itemStyle: {
            borderColor: "#fff",
            borderWidth: 2,
            gapWidth: 2,
          },
          levels: [
            {
              itemStyle: { borderWidth: 3, borderColor: "#555", gapWidth: 3 },
              upperLabel: { show: false },
            },
            {
              colorSaturation: satRange,
              itemStyle: { borderColorSaturation: 0.6, gapWidth: 2, borderWidth: 2 },
            },
            {
              colorSaturation: satRange,
              itemStyle: { borderColorSaturation: 0.35, gapWidth: 1 },
            },
          ],
        },
      ],
    };
  }, [data, showLabels, showBreadcrumb, showValues, colorSaturation, compact, stylingRules, paramValues]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart options={options} {...rest} />
    </div>
  );
}

export { TreemapChart };
