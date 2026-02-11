import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps, GraphNode, GraphEdge } from "./types";

export interface GraphChartProps extends Omit<BaseChartProps, "options"> {
  /** Graph nodes */
  nodes: GraphNode[];
  /** Graph edges */
  edges: GraphEdge[];
  /** Layout algorithm */
  layout?: "force" | "circular";
  /** Category names for coloring nodes */
  categories?: string[];
  /** Show node labels */
  showLabels?: boolean;
}

/**
 * Network/graph chart using ECharts force-directed or circular layout.
 * This is a basic graph visualization -- full Neo4j graph rendering
 * should use @neo4j-nvl/react in the core application.
 */
function GraphChart({
  nodes,
  edges,
  layout = "force",
  categories,
  showLabels = true,
  ...rest
}: GraphChartProps) {
  const options = useMemo((): EChartsOption => {
    if (!nodes.length) {
      return { title: { text: "No data", left: "center", top: "center", textStyle: { color: "#999", fontSize: 14 } } };
    }

    const categoryList = categories?.map((name) => ({ name })) ?? [];

    return {
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const p = params as { dataType?: string; name?: string; data?: { label?: string; value?: number } };
          if (p.dataType === "node") {
            return p.data?.label ?? p.name ?? "";
          }
          return p.name ?? "";
        },
      },
      legend: categoryList.length > 0 ? { bottom: 0, data: categories } : undefined,
      series: [
        {
          type: "graph",
          layout,
          roam: true,
          draggable: true,
          symbolSize: (value: unknown) => {
            const v = value as number | undefined;
            return v ? Math.max(20, Math.min(60, v)) : 30;
          },
          label: {
            show: showLabels,
            position: "right",
            formatter: (params: unknown) => {
              const p = params as { data?: { label?: string }; name?: string };
              return p.data?.label ?? p.name ?? "";
            },
          },
          edgeLabel: { fontSize: 10 },
          categories: categoryList.length > 0 ? categoryList : undefined,
          data: nodes.map((n) => ({
            id: n.id,
            name: n.label ?? n.id,
            value: n.value,
            category: n.category,
            symbolSize: n.value ? Math.max(20, Math.min(60, n.value)) : 30,
          })),
          edges: edges.map((e) => ({
            source: e.source,
            target: e.target,
            value: e.value,
            label: e.label ? { show: true, formatter: () => e.label! } : undefined,
          })),
          force: layout === "force"
            ? { repulsion: 200, edgeLength: [80, 200], gravity: 0.1 }
            : undefined,
          emphasis: {
            focus: "adjacency" as const,
            lineStyle: { width: 4 },
          },
          lineStyle: { curveness: 0.1 },
        },
      ],
    };
  }, [nodes, edges, layout, categories, showLabels]);

  return <BaseChart options={options} {...rest} />;
}

export { GraphChart };
