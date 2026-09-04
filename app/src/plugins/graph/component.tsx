/**
 * Graph widget plugin.
 *
 * Renders Neo4j nodes/relationships as an interactive force-directed graph
 * using Neo4j's NVL library. When a connection is available, uses the
 * GraphExplorationWrapper for expand-on-click exploration. Otherwise falls
 * back to the plain GraphChart component.
 */

import dynamic from "next/dynamic";
import { Skeleton, getChartOptions } from "@neoboard/components";
import type { GraphNode, GraphEdge, StylingRule } from "@neoboard/components";
import { GraphExplorationWrapper } from "@/components/graph-exploration-wrapper";
import { LazyVisible } from "@/components/lazy-visible";
import { defineChartPlugin } from "../registry";
import { transformToGraphData, validateGraphData } from "./transform";
import { type PluginProps } from "../utils";
import { graphSettingsSchema } from "./settings";
import { safeParseSettings } from "@/lib/plugin/safe-parse-settings";

// NVL (WebGL) is heavy — lazy load so it's only bundled when a graph widget renders.
const GraphChart = dynamic(
  () => import("@neoboard/components").then((m) => ({ default: m.GraphChart })),
  { ssr: false, loading: () => <Skeleton className="w-full h-full" /> },
);

function GraphPluginComponent({
  data,
  settings: raw,
  stylingRules,
  paramValues,
  onChartClick,
  connectionId,
  widgetId,
  resultId,
  autoFit,
}: PluginProps) {
  const settings = safeParseSettings(graphSettingsSchema, raw, "graph");
  const graphData = (data ?? { nodes: [], edges: [] }) as {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  const graph = connectionId ? (
    <GraphExplorationWrapper
      widgetId={widgetId ?? connectionId}
      nodes={graphData.nodes ?? []}
      edges={graphData.edges ?? []}
      connectionId={connectionId}
      settings={raw}
      onChartClick={onChartClick}
      resultId={resultId}
      autoFit={autoFit}
    />
  ) : (
    <GraphChart
      nodes={graphData.nodes ?? []}
      edges={graphData.edges ?? []}
      layout={settings.layout}
      showLabels={settings.showLabels}
      showRelationshipLabels={settings.showRelationshipLabels}
      onNodeSelect={
        onChartClick
          ? (ids: string[]) => {
              if (ids.length) onChartClick({ nodeId: ids[0] });
            }
          : undefined
      }
      autoFit={autoFit}
      stylingRules={stylingRules as StylingRule[] | undefined}
      paramValues={paramValues}
    />
  );

  // Mount the WebGL-backed graph only once it's on/near screen, so a graph-dense
  // dashboard doesn't build every context on initial load (#1052). Unmounting is
  // budget-gated (see LazyVisible): an off-screen graph stays mounted unless the
  // page is over the live-context budget, because a rebuild reshuffles the force
  // layout (#1367).
  return (
    <LazyVisible
      className="w-full h-full"
      fallback={
        <Skeleton className="w-full h-full" data-testid="graph-skeleton" />
      }
    >
      {graph}
    </LazyVisible>
  );
}

export const graphPlugin = defineChartPlugin({
  type: "graph",
  label: "Graph",
  component: GraphPluginComponent,
  transform: transformToGraphData,
  transformWithMapping: transformToGraphData,
  validate: validateGraphData,
  options: getChartOptions("graph"),
  compatibleWith: ["neo4j"],
  settingsSchema: graphSettingsSchema,
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
