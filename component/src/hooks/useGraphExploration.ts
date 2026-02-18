import { useState, useCallback, useRef } from "react";
import type { GraphNode, GraphEdge } from "@/charts/types";

export interface FetchNeighborsResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface UseGraphExplorationOptions {
  /** Starting nodes */
  initialNodes: GraphNode[];
  /** Starting edges */
  initialEdges: GraphEdge[];
  /** Async function to load neighbors for a node */
  fetchNeighbors: (node: GraphNode) => Promise<FetchNeighborsResult>;
  /** Maximum expansion depth (0 = initial only, 1 = one hop, etc.) */
  maxDepth?: number;
}

export interface UseGraphExplorationReturn {
  /** Current visible nodes (initial + all expansions) */
  nodes: GraphNode[];
  /** Current visible edges (initial + all expansions) */
  edges: GraphEdge[];
  /** Currently selected node IDs */
  selectedNodeIds: string[];
  /** ID of the node currently being expanded (loading), or null */
  expandingNodeId: string | null;
  /** IDs of nodes that have been successfully expanded */
  expandedNodeIds: string[];
  /** Selection handler — pass directly to GraphChart's onNodeSelect */
  onNodeSelect: (ids: string[]) => void;
  /** Expansion handler — pass directly to GraphChart's onExpandRequest */
  onExpandRequest: (node: GraphNode) => void;
  /** Collapse a previously expanded node, removing its uniquely-added neighbors */
  collapse: (nodeId: string) => void;
  /** Reset to initial state, clearing all expansions and selection */
  reset: () => void;
  /** Whether a node can be expanded (not already expanded, within depth limit) */
  canExpand: (nodeId: string) => boolean;
  /** Whether a node has been expanded and can be collapsed */
  canCollapse: (nodeId: string) => boolean;
}

interface ExpansionEntry {
  result: FetchNeighborsResult;
  sourceDepth: number;
}

function edgeKey(e: { source: string; target: string }): string {
  return `${e.source}->${e.target}`;
}

/**
 * Recompute the visible graph by merging initial data with all active expansions.
 * Only includes an expansion's results if the expanded node itself is reachable.
 * This naturally cascades: collapsing node A removes B (added by A),
 * which removes B's expansion results (if B was also expanded).
 */
function recomputeGraph(
  initialNodes: GraphNode[],
  initialEdges: GraphEdge[],
  expansions: Map<string, ExpansionEntry>,
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  depthMap: Map<string, number>;
  activeExpansionIds: Set<string>;
} {
  const nodeMap = new Map<string, GraphNode>();
  const depthMap = new Map<string, number>();
  const edgeSet = new Set<string>();
  const allEdges: GraphEdge[] = [];

  // Seed with initial data (depth 0)
  for (const n of initialNodes) {
    nodeMap.set(n.id, n);
    depthMap.set(n.id, 0);
  }
  for (const e of initialEdges) {
    const k = edgeKey(e);
    if (!edgeSet.has(k)) {
      edgeSet.add(k);
      allEdges.push(e);
    }
  }

  // Iterate until no new nodes/edges are added.
  // An expansion's results are only included if its source node is visible.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [nodeId, entry] of expansions) {
      if (!nodeMap.has(nodeId)) continue;

      const neighborDepth = entry.sourceDepth + 1;
      for (const n of entry.result.nodes) {
        if (!nodeMap.has(n.id)) {
          nodeMap.set(n.id, n);
          depthMap.set(n.id, neighborDepth);
          changed = true;
        } else {
          const existing = depthMap.get(n.id)!;
          if (neighborDepth < existing) {
            depthMap.set(n.id, neighborDepth);
          }
        }
      }
      for (const e of entry.result.edges) {
        const k = edgeKey(e);
        if (!edgeSet.has(k)) {
          edgeSet.add(k);
          allEdges.push(e);
          changed = true;
        }
      }
    }
  }

  // Only keep edges where both endpoints are visible
  const edges = allEdges.filter(
    (e) => nodeMap.has(e.source) && nodeMap.has(e.target),
  );

  // Active expansions = those whose source node is still visible
  const activeExpansionIds = new Set<string>();
  for (const nodeId of expansions.keys()) {
    if (nodeMap.has(nodeId)) {
      activeExpansionIds.add(nodeId);
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
    depthMap,
    activeExpansionIds,
  };
}

export function useGraphExploration({
  initialNodes,
  initialEdges,
  fetchNeighbors,
  maxDepth,
}: UseGraphExplorationOptions): UseGraphExplorationReturn {
  const [nodes, setNodes] = useState<GraphNode[]>(initialNodes);
  const [edges, setEdges] = useState<GraphEdge[]>(initialEdges);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [expandingNodeId, setExpandingNodeId] = useState<string | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<string[]>([]);

  const expansionsRef = useRef(new Map<string, ExpansionEntry>());
  const depthMapRef = useRef(new Map<string, number>());
  const expandingRef = useRef(false);
  const initialNodesRef = useRef(initialNodes);
  const initialEdgesRef = useRef(initialEdges);
  const fetchNeighborsRef = useRef(fetchNeighbors);
  fetchNeighborsRef.current = fetchNeighbors;

  // Initialize depth map for initial nodes (runs once synchronously)
  if (depthMapRef.current.size === 0) {
    for (const n of initialNodes) {
      depthMapRef.current.set(n.id, 0);
    }
  }

  /** Recompute visible graph from current expansions and update all state */
  const applyRecompute = useCallback(() => {
    const result = recomputeGraph(
      initialNodesRef.current,
      initialEdgesRef.current,
      expansionsRef.current,
    );

    setNodes(result.nodes);
    setEdges(result.edges);
    depthMapRef.current = result.depthMap;

    // Clean up orphaned expansions (source node no longer visible)
    for (const nodeId of expansionsRef.current.keys()) {
      if (!result.activeExpansionIds.has(nodeId)) {
        expansionsRef.current.delete(nodeId);
      }
    }
    setExpandedNodeIds(Array.from(result.activeExpansionIds));

    // Prune selection to surviving nodes
    const surviving = new Set(result.nodes.map((n) => n.id));
    setSelectedNodeIds((prev) => {
      const filtered = prev.filter((id) => surviving.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, []);

  const onExpandRequest = useCallback(
    async (node: GraphNode) => {
      if (expansionsRef.current.has(node.id)) return;
      if (expandingRef.current) return;

      const depth = depthMapRef.current.get(node.id) ?? 0;
      if (maxDepth != null && depth >= maxDepth) return;

      expandingRef.current = true;
      setExpandingNodeId(node.id);
      try {
        const result = await fetchNeighborsRef.current(node);
        expansionsRef.current.set(node.id, {
          result,
          sourceDepth: depth,
        });
        applyRecompute();
      } finally {
        expandingRef.current = false;
        setExpandingNodeId(null);
      }
    },
    [maxDepth, applyRecompute],
  );

  const collapse = useCallback(
    (nodeId: string) => {
      if (!expansionsRef.current.has(nodeId)) return;
      expansionsRef.current.delete(nodeId);
      applyRecompute();
    },
    [applyRecompute],
  );

  const reset = useCallback(() => {
    expansionsRef.current.clear();
    depthMapRef.current.clear();
    for (const n of initialNodesRef.current) {
      depthMapRef.current.set(n.id, 0);
    }
    setNodes(initialNodesRef.current);
    setEdges(initialEdgesRef.current);
    setSelectedNodeIds([]);
    setExpandingNodeId(null);
    setExpandedNodeIds([]);
  }, []);

  const canExpand = useCallback(
    (nodeId: string) => {
      if (expansionsRef.current.has(nodeId)) return false;
      if (maxDepth == null) return true;
      const depth = depthMapRef.current.get(nodeId) ?? 0;
      return depth < maxDepth;
    },
    [maxDepth],
  );

  const canCollapse = useCallback((nodeId: string) => {
    return expansionsRef.current.has(nodeId);
  }, []);

  return {
    nodes,
    edges,
    selectedNodeIds,
    expandingNodeId,
    expandedNodeIds,
    onNodeSelect: setSelectedNodeIds,
    onExpandRequest,
    collapse,
    reset,
    canExpand,
    canCollapse,
  };
}
