"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  GraphChart,
  useGraphExploration,
} from "@neoboard/components";
import type {
  GraphNode,
  GraphEdge,
  GraphNodeEvent,
  FetchNeighborsResult,
} from "@neoboard/components";
import { getChartConfig } from "@/lib/chart-registry";

interface GraphExplorationWrapperProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  connectionId: string;
  settings: Record<string, unknown>;
  onChartClick?: (point: Record<string, unknown>) => void;
}

interface NodeMenu {
  node: GraphNode;
  x: number;
  y: number;
}

function NodeContextMenu({
  menu,
  onClose,
  onExpand,
  onCollapse,
}: {
  menu: NodeMenu;
  onClose: () => void;
  onExpand?: () => void;
  onCollapse?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const items = [
    onExpand && { label: "Expand", action: onExpand },
    onCollapse && { label: "Collapse", action: onCollapse },
  ].filter(Boolean) as { label: string; action: () => void }[];

  return createPortal(
    <div
      ref={ref}
      data-testid="graph-context-menu"
      className="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md text-sm"
      style={{ left: menu.x, top: menu.y }}
    >
      <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium border-b mb-1">
        {menu.node.label ?? menu.node.id}
      </div>
      {items.length === 0 && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground">
          No actions
        </div>
      )}
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            item.action();
            onClose();
          }}
          className="flex w-full items-center rounded-sm px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

export function GraphExplorationWrapper({
  nodes: initialNodes,
  edges: initialEdges,
  connectionId,
  settings,
  onChartClick,
}: GraphExplorationWrapperProps) {
  const [menu, setMenu] = useState<NodeMenu | null>(null);

  const fetchNeighbors = useCallback(
    async (node: GraphNode): Promise<FetchNeighborsResult> => {
      const query =
        "MATCH (n)-[r]-(neighbor) WHERE elementId(n) = $nodeId RETURN n, r, neighbor";
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId,
          query,
          params: { nodeId: node.id },
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch neighbors: ${res.statusText}`);
      }

      const result = await res.json();
      const graphConfig = getChartConfig("graph");
      if (!graphConfig) return { nodes: [], edges: [] };

      const transformed = graphConfig.transform(result.data) as {
        nodes: GraphNode[];
        edges: GraphEdge[];
      };
      return {
        nodes: transformed.nodes ?? [],
        edges: transformed.edges ?? [],
      };
    },
    [connectionId],
  );

  const exploration = useGraphExploration({
    initialNodes,
    initialEdges,
    fetchNeighbors,
    maxDepth: 3,
  });

  const handleNodeRightClick = useCallback(
    (e: GraphNodeEvent) => {
      setMenu({ node: e.node, x: e.position.x, y: e.position.y });
    },
    [],
  );

  return (
    <div className="relative h-full w-full" data-testid="graph-exploration">
      <GraphChart
        nodes={exploration.nodes}
        edges={exploration.edges}
        selectedNodeIds={exploration.selectedNodeIds}
        onNodeSelect={(ids) => {
          exploration.onNodeSelect(ids);
          if (onChartClick && ids.length) {
            onChartClick({ nodeId: ids[0] });
          }
        }}
        onNodeRightClick={handleNodeRightClick}
        layout={settings.layout as "force" | "circular" | undefined}
        showLabels={settings.showLabels as boolean | undefined}
      />

      {/* Status bar */}
      <div
        className="absolute bottom-2 left-2 flex items-center gap-3 rounded-md bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm border"
        data-testid="graph-status-bar"
      >
        <span data-testid="graph-node-count">
          {exploration.nodes.length} nodes
        </span>
        <span data-testid="graph-edge-count">
          {exploration.edges.length} edges
        </span>
        {exploration.expandingNodeId && (
          <span className="text-primary animate-pulse">Loading…</span>
        )}
        {exploration.expandedNodeIds.length > 0 && (
          <button
            onClick={() => exploration.reset()}
            className="text-primary hover:underline cursor-pointer"
            data-testid="graph-reset-button"
          >
            Reset
          </button>
        )}
      </div>

      {/* Context menu */}
      {menu && (
        <NodeContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onExpand={
            exploration.canExpand(menu.node.id)
              ? () => exploration.onExpandRequest(menu.node)
              : undefined
          }
          onCollapse={
            exploration.canCollapse(menu.node.id)
              ? () => exploration.collapse(menu.node.id)
              : undefined
          }
        />
      )}
    </div>
  );
}
