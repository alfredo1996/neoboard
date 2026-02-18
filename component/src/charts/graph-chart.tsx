import { useMemo, useCallback, useRef } from "react";
import { InteractiveNvlWrapper } from "@neo4j-nvl/react";
import type { InteractiveNvlWrapperProps } from "@neo4j-nvl/react";
import type { Node as NvlNode, Relationship as NvlRelationship } from "@neo4j-nvl/base";
import type { GraphNode, GraphEdge, GraphNodeEvent } from "./types";

export interface GraphChartRef {
  zoomToFit: () => void;
}

export interface GraphChartProps {
  /** Graph nodes */
  nodes: GraphNode[];
  /** Graph edges */
  edges: GraphEdge[];
  /**
   * Layout algorithm.
   * 'force' maps to NVL 'forceDirected', 'circular' maps to NVL 'circular'.
   */
  layout?: "force" | "circular";
  /** Show node labels (captions) */
  showLabels?: boolean;
  /** Controlled selection — IDs of selected nodes */
  selectedNodeIds?: string[];
  /** Toggle selection on click */
  onNodeSelect?: (ids: string[]) => void;
  /** Fired on double-click for neighbor loading */
  onExpandRequest?: (node: GraphNode) => void;
  /** Inspect / drill-down on double-click */
  onNodeDoubleClick?: (event: GraphNodeEvent) => void;
  /** Additional CSS classes */
  className?: string;
}

/** Map our internal layout names to NVL layout names. */
function toNvlLayout(layout: "force" | "circular" = "force"): "forceDirected" | "circular" {
  return layout === "circular" ? "circular" : "forceDirected";
}

/**
 * Maps our internal GraphNode type to an NVL Node.
 * The node's label is used as the caption shown inside the node.
 */
function toNvlNode(node: GraphNode, showLabels: boolean): NvlNode {
  return {
    id: node.id,
    caption: showLabels ? (node.label ?? node.id) : undefined,
    color: node.color,
    size: node.value ? Math.max(20, Math.min(60, node.value)) : undefined,
    pinned: node.fixed,
    x: node.x,
    y: node.y,
  };
}

/**
 * Maps our internal GraphEdge type to an NVL Relationship.
 * Generates a stable ID from source+target if not present.
 */
function toNvlRelationship(edge: GraphEdge, index: number): NvlRelationship {
  return {
    id: `rel-${edge.source}-${edge.target}-${index}`,
    from: edge.source,
    to: edge.target,
    caption: edge.label,
    type: edge.label,
    color: edge.color,
  };
}

/**
 * GraphChart — renders a Neo4j graph using the NVL (Neo4j Visualization Library).
 *
 * Accepts nodes and edges in NeoBoard's internal format and maps them to NVL's
 * Node/Relationship format. Renders an empty-state message when there is no data,
 * so non-graph query results (e.g. plain tabular data) fail gracefully.
 */
export function GraphChart({
  nodes,
  edges,
  layout = "force",
  showLabels = true,
  selectedNodeIds,
  onNodeSelect,
  onExpandRequest,
  onNodeDoubleClick,
  className,
}: GraphChartProps) {
  // Stable ref to latest callbacks — avoids re-creating NVL on every render
  const onNodeSelectRef = useRef(onNodeSelect);
  onNodeSelectRef.current = onNodeSelect;
  const onExpandRequestRef = useRef(onExpandRequest);
  onExpandRequestRef.current = onExpandRequest;
  const onNodeDoubleClickRef = useRef(onNodeDoubleClick);
  onNodeDoubleClickRef.current = onNodeDoubleClick;

  // Keep a ref to the full nodes array for event handlers
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const selectedRef = useRef(selectedNodeIds);
  selectedRef.current = selectedNodeIds;

  const nvlNodes = useMemo(
    () => nodes.map((n) => toNvlNode(n, showLabels)),
    [nodes, showLabels],
  );

  const nvlRels = useMemo(
    () => edges.map((e, i) => toNvlRelationship(e, i)),
    [edges],
  );

  const mouseEventCallbacks = useCallback((): InteractiveNvlWrapperProps["mouseEventCallbacks"] => ({
    onNodeClick: (node) => {
      if (!onNodeSelectRef.current) return;
      const current = selectedRef.current ?? [];
      const id = node.id;
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      onNodeSelectRef.current(next);
    },
  }), []);

  // No data: show a clear message instead of an empty canvas
  if (!nodes.length) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-muted/20 rounded ${className ?? ""}`}>
        <div className="text-center text-muted-foreground p-6">
          <p className="text-sm font-medium">No graph data</p>
          <p className="text-xs mt-1">
            Query must return nodes and relationships. Use Neo4j with a Cypher MATCH query.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full w-full ${className ?? ""}`}>
      <InteractiveNvlWrapper
        nodes={nvlNodes}
        rels={nvlRels}
        layout={toNvlLayout(layout)}
        mouseEventCallbacks={mouseEventCallbacks()}
        nvlOptions={{
          allowDynamicMinZoom: true,
          initialZoom: 0.7,
        }}
      />
    </div>
  );
}
