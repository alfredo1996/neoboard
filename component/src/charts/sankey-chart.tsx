import { useMemo } from "react";
import * as echarts from "echarts/core";
import { SankeyChart as ESankeyChart } from "echarts/charts";
import { TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import { resolveItemColor } from "./chart-utils";
import type { StylingRule } from "./styling-rule";

echarts.use([ESankeyChart, TitleComponent, TooltipComponent, CanvasRenderer]);

export interface SankeyNode {
  name: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyChartData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

export interface SankeyChartProps extends Omit<BaseChartProps, "options"> {
  /** Sankey data with nodes and links */
  data: SankeyChartData;
  /** Orientation of the flow */
  orient?: "horizontal" | "vertical";
  /** Show node labels */
  showLabels?: boolean;
  /** Node block width in pixels */
  nodeWidth?: number;
  /** Gap between nodes in pixels */
  nodeGap?: number;
  /** Rule-based styling rules */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for parameterRef comparisons */
  paramValues?: Record<string, unknown>;
}

/**
 * Sankey chart for visualizing flow between nodes.
 * Accepts `data` as `{ nodes: [{ name }], links: [{ source, target, value }] }`.
 */
function SankeyChart({
  data,
  orient = "horizontal",
  showLabels = true,
  nodeWidth = 20,
  nodeGap = 8,
  stylingRules,
  paramValues,
  ...rest
}: SankeyChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const compact = width > 0 && (width < 300 || height < 200);

  const options = useMemo((): EChartsOption => {
    if (!data.nodes.length || !data.links.length) {
      return {
        title: {
          text: "No data",
          left: "center",
          top: "center",
          textStyle: { color: "#999", fontSize: 14 },
        },
      };
    }

    return {
      tooltip: {
        trigger: "item",
        triggerOn: "mousemove",
      },
      series: [
        {
          type: "sankey",
          orient,
          data: data.nodes,
          links: stylingRules?.length
            ? data.links.map((link) => {
                const resolvedColor = resolveItemColor(link.value, stylingRules, paramValues, []);
                return {
                  ...link,
                  lineStyle: resolvedColor ? { color: resolvedColor } : {},
                };
              })
            : data.links,
          nodeWidth: compact ? Math.max(nodeWidth - 4, 10) : nodeWidth,
          nodeGap: compact ? Math.max(nodeGap - 2, 4) : nodeGap,
          label: {
            show: showLabels && !compact,
            position: orient === "vertical" ? "top" : "right",
          },
          lineStyle: {
            color: "gradient",
            curveness: 0.5,
          },
          emphasis: {
            focus: "adjacency",
          },
        },
      ],
    };
  }, [data, orient, showLabels, nodeWidth, nodeGap, compact, stylingRules, paramValues]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <BaseChart options={options} {...rest} />
    </div>
  );
}

export { SankeyChart };
