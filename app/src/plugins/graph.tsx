/**
 * Graph widget plugin.
 *
 * Renders Neo4j nodes/relationships as an interactive force-directed graph
 * using Neo4j's NVL library. When a connection is available, uses the
 * GraphExplorationWrapper for expand-on-click exploration. Otherwise falls
 * back to the plain GraphChart component.
 */

import dynamic from "next/dynamic";
import { Skeleton } from "@neoboard/components";
import type { GraphNode, GraphEdge, StylingRule } from "@neoboard/components";
import { GraphExplorationWrapper } from "@/components/graph-exploration-wrapper";
import { defineChartPlugin } from "./registry";
import { chartRegistry } from "@/lib/chart-registry";

// NVL (WebGL) is heavy — lazy load so it's only bundled when a graph widget renders.
const GraphChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.GraphChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

interface PluginComponentProps {
  data: unknown;
  settings: Record<string, unknown>;
  stylingRules?: StylingRule[];
  paramValues?: Record<string, unknown>;
  onChartClick?: (point: Record<string, unknown>) => void;
  connectionId?: string;
  widgetId?: string;
  resultId?: string;
  autoFit?: boolean;
}

function GraphPluginComponent({
  data,
  settings,
  stylingRules,
  paramValues,
  onChartClick,
  connectionId,
  widgetId,
  resultId,
  autoFit,
}: PluginComponentProps) {
  const graphData = (data ?? { nodes: [], edges: [] }) as {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  if (connectionId) {
    return (
      <GraphExplorationWrapper
        widgetId={widgetId ?? connectionId}
        nodes={graphData.nodes ?? []}
        edges={graphData.edges ?? []}
        connectionId={connectionId}
        settings={settings}
        onChartClick={onChartClick}
        resultId={resultId}
        autoFit={autoFit}
      />
    );
  }
  return (
    <GraphChart
      nodes={graphData.nodes ?? []}
      edges={graphData.edges ?? []}
      layout={settings.layout as "force" | "circular" | undefined}
      showLabels={settings.showLabels as boolean | undefined}
      onNodeSelect={
        onChartClick
          ? (ids) => {
              if (ids.length) onChartClick({ nodeId: ids[0] });
            }
          : undefined
      }
      autoFit={autoFit}
      stylingRules={stylingRules}
      paramValues={paramValues}
    />
  );
}

export const graphPlugin = defineChartPlugin({
  type: "graph",
  label: "Graph",
  component: GraphPluginComponent,
  transform: chartRegistry.graph.transform,
  transformWithMapping: chartRegistry.graph.transformWithMapping,
  validate: chartRegistry.graph.validate,
  compatibleWith: ["neo4j"],
  stylingTargets: [{ value: "color", label: "Node Color" }],
  capabilities: {
    supportsClickAction: true,
    supportsStyling: true,
    isECharts: false,
    requiresQuery: true,
  },
  queryHint:
    "Return Neo4j nodes, relationships, or paths.\n" +
    "Example: MATCH (n)-[r]->(m) RETURN n, r, m",
});
