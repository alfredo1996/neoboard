import { useMemo } from "react";
import * as echarts from "echarts/core";
import { SankeyChart as ESankeyChart } from "echarts/charts";
import { TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import { BaseChart, useDarkMode } from "./base-chart";
import type { BaseChartProps } from "./types";
import { useContainerSize } from "@/hooks/useContainerSize";
import { buildEmptyDataOption, resolveItemColor } from "./chart-utils";
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
  ariaDescription,
  ...rest
}: SankeyChartProps) {
  const { width, height, containerRef } = useContainerSize();
  const compact = width > 0 && (width < 300 || height < 200);

  // The empty-state colour comes from the theme, so this memo has to
  // rebuild on a toggle — a DOM read inside it froze at mount (#1286).
  const dark = useDarkMode();

  // ECharts keys sankey nodes by name and throws from its layout on a
  // duplicate. A GROUP BY that is not actually unique produces one; the
  // app's transform dedupes, but direct callers and external chart plugins
  // hand nodes over as they are (#1667).
  const nodes = useMemo(() => {
    const seen = new Set<string>();
    return data.nodes.filter((n) =>
      seen.has(n.name) ? false : (seen.add(n.name), true),
    );
  }, [data.nodes]);

  const options = useMemo((): EChartsOption => {
    if (!nodes.length || !data.links.length) return buildEmptyDataOption(dark);

    return {
      tooltip: {
        trigger: "item",
        triggerOn: "mousemove",
      },
      series: [
        {
          type: "sankey",
          orient,
          data: nodes,
          links: stylingRules?.length
            ? data.links.map((link) => {
                const resolvedColor = resolveItemColor(
                  link.value,
                  stylingRules,
                  paramValues,
                );
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
  }, [
    nodes,
    data,
    orient,
    showLabels,
    nodeWidth,
    nodeGap,
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
          `Sankey diagram with ${nodes.length} nodes and ${data.links.length} links`
        }
        {...rest}
      />
    </div>
  );
}

export { SankeyChart };
