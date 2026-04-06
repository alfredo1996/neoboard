"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { unwrapFullResponse } from "@/lib/api-client";
import {
  GraphChart,
  useGraphExploration,
  PropertyPanel,
  Badge,
} from "@neoboard/components";
import type {
  GraphNode,
  GraphEdge,
  GraphNodeEvent,
  FetchNeighborsResult,
  PropertySection,
} from "@neoboard/components";
import { getChartConfig } from "@/lib/chart-registry";
import { normalizeValue } from "@/lib/normalize-value";
import { useGraphWidgetStore } from "@/stores/graph-widget-store";

interface GraphExplorationWrapperProps {
  widgetId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  connectionId: string;
  settings: Record<string, unknown>;
  onChartClick?: (point: Record<string, unknown>) => void;
  /** Server-generated hash of the query that produced this data.
   *  Used to detect when the query changed so stale exploration state
   *  can be discarded. */
  resultId?: string;
  /** When true, triggers a fit-to-viewport after mount with a short delay. */
  autoFit?: boolean;
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
  onProperties,
}: {
  menu: NodeMenu;
  onClose: () => void;
  onExpand?: () => void;
  onCollapse?: () => void;
  onProperties?: () => void;
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
    onProperties && { label: "Properties", action: onProperties },
    onExpand && { label: "Expand", action: onExpand },
    onCollapse && { label: "Collapse", action: onCollapse },
  ].filter(Boolean) as { label: string; action: () => void }[];

  return (
    <div
      ref={ref}
      data-testid="graph-context-menu"
      className="absolute z-[500] min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md text-sm"
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
    </div>
  );
}

function edgeToSections(edge: GraphEdge): PropertySection[] {
  const props = edge.properties ?? {};
  const propertyItems = Object.entries(props).map(([key, value]) => {
    const normalized = normalizeValue(value) ?? value;
    return {
      key,
      value:
        typeof normalized === "object" && normalized !== null
          ? JSON.stringify(normalized)
          : String(normalized ?? ""),
    };
  });
  const metaItems = [
    ...(edge.id ? [{ key: "id", value: edge.id }] : []),
    { key: "type", value: edge.label ?? "UNKNOWN" },
    { key: "source", value: edge.source },
    { key: "target", value: edge.target },
  ];
  return [
    { title: "Metadata", items: metaItems, collapsible: false as const },
    ...(propertyItems.length > 0
      ? [{ title: "Properties", items: propertyItems }]
      : []),
  ];
}

function nodeToSections(node: GraphNode): PropertySection[] {
  const props = node.properties ?? {};
  const propertyItems = Object.entries(props).map(([key, value]) => {
    const normalized = normalizeValue(value) ?? value;
    return {
      key,
      value:
        typeof normalized === "object" && normalized !== null
          ? JSON.stringify(normalized)
          : String(normalized ?? ""),
    };
  });
  const metaItems = [
    { key: "id", value: node.id },
    ...(node.labels?.length
      ? [{ key: "labels", value: node.labels.join(", ") }]
      : []),
  ];
  return [
    { title: "Metadata", items: metaItems, collapsible: false as const },
    ...(propertyItems.length > 0
      ? [{ title: "Properties", items: propertyItems }]
      : []),
  ];
}

export function GraphExplorationWrapper({
  widgetId,
  nodes: initialNodes,
  edges: initialEdges,
  connectionId,
  settings,
  onChartClick,
  resultId,
  autoFit,
}: GraphExplorationWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<NodeMenu | null>(null);
  type InspectedElement =
    | { type: "node"; node: GraphNode }
    | { type: "edge"; edge: GraphEdge }
    | null;
  const [inspectedElement, setInspectedElement] =
    useState<InspectedElement>(null);
  const storeSetState = useGraphWidgetStore((s) => s.setState);
  const stored = useGraphWidgetStore((s) => s.states[widgetId]);

  // If the stored state was built from a different query (different resultId),
  // discard it so the graph resets to the new data instead of showing stale
  // exploration state. When resultId is undefined (e.g. preview mode without
  // a full query run), always use the incoming data.
  const storedIsValid =
    stored != null && resultId != null && stored.resultId === resultId;

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

      const { data: result } = await unwrapFullResponse<{
        data: unknown;
        fields?: unknown;
      }>(res);
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
    initialNodes: storedIsValid ? stored.nodes : initialNodes,
    initialEdges: storedIsValid ? stored.edges : initialEdges,
    fetchNeighbors,
    maxDepth: 3,
  });

  // Persist exploration state to the store whenever it changes, always
  // recording the current resultId so we can detect stale state next render.
  useEffect(() => {
    storeSetState(widgetId, {
      nodes: exploration.nodes,
      edges: exploration.edges,
      resultId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploration.nodes, exploration.edges]);

  const handleNodeRightClick = useCallback((e: GraphNodeEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const x = e.position.x - (rect?.left ?? 0);
    const y = e.position.y - (rect?.top ?? 0);
    setMenu({ node: e.node, x, y });
  }, []);

  // Keep a ref to the current exploration value so handleNodeSelect stays
  // stable across renders even as exploration.nodes / selection change.
  // Without this, the inline callback would be rebuilt every render,
  // causing GraphChart to see a new prop identity each time.
  const explorationRef = useRef(exploration);
  explorationRef.current = exploration;

  const handleNodeSelect = useCallback(
    (ids: string[]) => {
      explorationRef.current.onNodeSelect(ids);
      if (onChartClick && ids.length) {
        onChartClick({ nodeId: ids[0] });
      }
      // Open property panel on single-click
      if (ids.length === 1) {
        const node = explorationRef.current.nodes.find((n) => n.id === ids[0]);
        if (node) setInspectedElement({ type: "node", node });
      } else {
        setInspectedElement(null);
      }
    },
    [onChartClick],
  );

  const handleRelationshipClick = useCallback((event: { edge: GraphEdge }) => {
    setInspectedElement({ type: "edge", edge: event.edge });
  }, []);

  const handleLayoutChange = useCallback(
    (layout: "force" | "circular" | "hierarchical") => {
      storeSetState(widgetId, { layout });
    },
    [storeSetState, widgetId],
  );

  const handleCaptionMapChange = useCallback(
    (captionMap: Record<string, string>) => {
      storeSetState(widgetId, { captionMap });
    },
    [storeSetState, widgetId],
  );

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      data-testid="graph-exploration"
    >
      <GraphChart
        nodes={exploration.nodes}
        edges={exploration.edges}
        selectedNodeIds={exploration.selectedNodeIds}
        onNodeSelect={handleNodeSelect}
        onNodeRightClick={handleNodeRightClick}
        onRelationshipClick={handleRelationshipClick}
        layout={settings.layout as "force" | "circular" | undefined}
        initialLayout={storedIsValid ? stored.layout : undefined}
        initialCaptionMap={storedIsValid ? stored.captionMap : undefined}
        showLabels={settings.showLabels as boolean | undefined}
        onLayoutChange={handleLayoutChange}
        onCaptionMapChange={handleCaptionMapChange}
        autoFit={autoFit}
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
          onProperties={() => {
            setInspectedElement({ type: "node", node: menu.node });
            setMenu(null);
          }}
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

      {/* Property inspector side panel */}
      {inspectedElement && (
        <div className="absolute top-0 right-0 bottom-0 w-80 border-l bg-background/95 backdrop-blur-sm overflow-y-auto z-20 shadow-lg">
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center gap-2 min-w-0">
              <Badge variant="secondary" className="shrink-0">
                {inspectedElement.type === "node" ? "Node" : "Relationship"}
              </Badge>
              <h3 className="text-sm font-semibold truncate">
                {inspectedElement.type === "node"
                  ? (inspectedElement.node.label ??
                    inspectedElement.node.id ??
                    "Node")
                  : (inspectedElement.edge.label ?? "Relationship")}
              </h3>
            </div>
            <button
              onClick={() => setInspectedElement(null)}
              className="text-muted-foreground hover:text-foreground text-lg leading-none"
              aria-label="Close properties panel"
            >
              &times;
            </button>
          </div>
          <div className="p-2">
            <PropertyPanel
              sections={
                inspectedElement.type === "node"
                  ? nodeToSections(inspectedElement.node)
                  : edgeToSections(inspectedElement.edge)
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
