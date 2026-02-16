import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useGraphExploration } from "../useGraphExploration";
import type { UseGraphExplorationOptions } from "../useGraphExploration";
import type { GraphNode, GraphEdge } from "@/charts/types";

// --- Test data ---

const nodeA: GraphNode = { id: "a", label: "A" };
const nodeB: GraphNode = { id: "b", label: "B" };
const nodeC: GraphNode = { id: "c", label: "C" };
const nodeD: GraphNode = { id: "d", label: "D" };
const edgeAB: GraphEdge = { source: "a", target: "b" };
const edgeBC: GraphEdge = { source: "b", target: "c" };
const edgeCD: GraphEdge = { source: "c", target: "d" };
const edgeBD: GraphEdge = { source: "b", target: "d" };

function makeOptions(
  overrides?: Partial<UseGraphExplorationOptions>,
): UseGraphExplorationOptions {
  return {
    initialNodes: [nodeA, nodeB],
    initialEdges: [edgeAB],
    fetchNeighbors: vi.fn(async () => ({ nodes: [], edges: [] })),
    ...overrides,
  };
}

function ids(nodes: GraphNode[]): string[] {
  return nodes.map((n) => n.id).sort();
}

function edgeKeys(edges: GraphEdge[]): string[] {
  return edges.map((e) => `${e.source}->${e.target}`).sort();
}

// --- Tests ---

describe("useGraphExploration", () => {
  it("returns initial nodes and edges", () => {
    const { result } = renderHook(() => useGraphExploration(makeOptions()));
    expect(ids(result.current.nodes)).toEqual(["a", "b"]);
    expect(edgeKeys(result.current.edges)).toEqual(["a->b"]);
  });

  it("starts with empty selection and no expansions", () => {
    const { result } = renderHook(() => useGraphExploration(makeOptions()));
    expect(result.current.selectedNodeIds).toEqual([]);
    expect(result.current.expandingNodeId).toBeNull();
    expect(result.current.expandedNodeIds).toEqual([]);
  });

  it("expands a node and merges neighbors", async () => {
    const fetchNeighbors = vi.fn(async () => ({
      nodes: [nodeC],
      edges: [edgeBC],
    }));
    const { result } = renderHook(() =>
      useGraphExploration(makeOptions({ fetchNeighbors })),
    );

    await act(() => result.current.onExpandRequest(nodeB));

    expect(fetchNeighbors).toHaveBeenCalledWith(nodeB);
    expect(ids(result.current.nodes)).toEqual(["a", "b", "c"]);
    expect(edgeKeys(result.current.edges)).toEqual(["a->b", "b->c"]);
    expect(result.current.expandedNodeIds).toEqual(["b"]);
  });

  it("deduplicates nodes already present", async () => {
    const fetchNeighbors = vi.fn(async () => ({
      nodes: [nodeA, nodeC], // nodeA already exists
      edges: [edgeBC],
    }));
    const { result } = renderHook(() =>
      useGraphExploration(makeOptions({ fetchNeighbors })),
    );

    await act(() => result.current.onExpandRequest(nodeB));

    expect(ids(result.current.nodes)).toEqual(["a", "b", "c"]);
  });

  it("deduplicates edges already present", async () => {
    const fetchNeighbors = vi.fn(async () => ({
      nodes: [nodeC],
      edges: [edgeAB, edgeBC], // edgeAB already exists
    }));
    const { result } = renderHook(() =>
      useGraphExploration(makeOptions({ fetchNeighbors })),
    );

    await act(() => result.current.onExpandRequest(nodeB));

    expect(edgeKeys(result.current.edges)).toEqual(["a->b", "b->c"]);
  });

  it("does not expand the same node twice", async () => {
    const fetchNeighbors = vi.fn(async () => ({
      nodes: [nodeC],
      edges: [edgeBC],
    }));
    const { result } = renderHook(() =>
      useGraphExploration(makeOptions({ fetchNeighbors })),
    );

    await act(() => result.current.onExpandRequest(nodeB));
    await act(() => result.current.onExpandRequest(nodeB));

    expect(fetchNeighbors).toHaveBeenCalledTimes(1);
  });

  it("collapses a node and removes uniquely-added neighbors", async () => {
    const fetchNeighbors = vi.fn(async () => ({
      nodes: [nodeC, nodeD],
      edges: [edgeBC, edgeCD],
    }));
    const { result } = renderHook(() =>
      useGraphExploration(makeOptions({ fetchNeighbors })),
    );

    await act(() => result.current.onExpandRequest(nodeB));
    expect(ids(result.current.nodes)).toEqual(["a", "b", "c", "d"]);

    act(() => result.current.collapse("b"));
    expect(ids(result.current.nodes)).toEqual(["a", "b"]);
    expect(edgeKeys(result.current.edges)).toEqual(["a->b"]);
    expect(result.current.expandedNodeIds).toEqual([]);
  });

  it("cascading collapse: collapsing A removes B's expansion too", async () => {
    // Start with just [A], expand A → [B], expand B → [C]
    const fetchNeighbors = vi.fn(async (node: GraphNode) => {
      if (node.id === "a")
        return { nodes: [nodeB], edges: [edgeAB] };
      if (node.id === "b")
        return { nodes: [nodeC], edges: [edgeBC] };
      return { nodes: [], edges: [] };
    });

    const { result } = renderHook(() =>
      useGraphExploration(
        makeOptions({
          initialNodes: [nodeA],
          initialEdges: [],
          fetchNeighbors,
        }),
      ),
    );

    await act(() => result.current.onExpandRequest(nodeA));
    expect(ids(result.current.nodes)).toEqual(["a", "b"]);

    await act(() => result.current.onExpandRequest(nodeB));
    expect(ids(result.current.nodes)).toEqual(["a", "b", "c"]);
    expect(result.current.expandedNodeIds).toContain("a");
    expect(result.current.expandedNodeIds).toContain("b");

    // Collapse A → B disappears → B's expansion (C) also disappears
    act(() => result.current.collapse("a"));
    expect(ids(result.current.nodes)).toEqual(["a"]);
    expect(result.current.expandedNodeIds).toEqual([]);
  });

  it("preserves shared nodes on partial collapse", async () => {
    // A and B both connect to D
    const fetchNeighbors = vi.fn(async (node: GraphNode) => {
      if (node.id === "a")
        return { nodes: [nodeD], edges: [{ source: "a", target: "d" }] };
      if (node.id === "b")
        return { nodes: [nodeD], edges: [edgeBD] };
      return { nodes: [], edges: [] };
    });

    const { result } = renderHook(() =>
      useGraphExploration(makeOptions({ fetchNeighbors })),
    );

    await act(() => result.current.onExpandRequest(nodeA));
    await act(() => result.current.onExpandRequest(nodeB));
    expect(ids(result.current.nodes)).toEqual(["a", "b", "d"]);

    // Collapse A — D is still reachable via B's expansion
    act(() => result.current.collapse("a"));
    expect(ids(result.current.nodes)).toEqual(["a", "b", "d"]);
  });

  it("respects maxDepth", async () => {
    const fetchNeighbors = vi.fn(async (node: GraphNode) => {
      if (node.id === "b")
        return { nodes: [nodeC], edges: [edgeBC] };
      if (node.id === "c")
        return { nodes: [nodeD], edges: [edgeCD] };
      return { nodes: [], edges: [] };
    });

    const { result } = renderHook(() =>
      useGraphExploration(makeOptions({ fetchNeighbors, maxDepth: 1 })),
    );

    // B is at depth 0 → can expand (depth < 1)
    expect(result.current.canExpand("b")).toBe(true);

    await act(() => result.current.onExpandRequest(nodeB));
    expect(ids(result.current.nodes)).toEqual(["a", "b", "c"]);

    // C is at depth 1 → cannot expand (depth >= maxDepth)
    expect(result.current.canExpand("c")).toBe(false);

    await act(() => result.current.onExpandRequest(nodeC));
    // Should not have expanded C
    expect(fetchNeighbors).toHaveBeenCalledTimes(1);
    expect(ids(result.current.nodes)).toEqual(["a", "b", "c"]);
  });

  it("canExpand returns false for already-expanded nodes", async () => {
    const fetchNeighbors = vi.fn(async () => ({
      nodes: [nodeC],
      edges: [edgeBC],
    }));
    const { result } = renderHook(() =>
      useGraphExploration(makeOptions({ fetchNeighbors })),
    );

    expect(result.current.canExpand("b")).toBe(true);
    await act(() => result.current.onExpandRequest(nodeB));
    expect(result.current.canExpand("b")).toBe(false);
  });

  it("canCollapse returns correct values", async () => {
    const fetchNeighbors = vi.fn(async () => ({
      nodes: [nodeC],
      edges: [edgeBC],
    }));
    const { result } = renderHook(() =>
      useGraphExploration(makeOptions({ fetchNeighbors })),
    );

    expect(result.current.canCollapse("b")).toBe(false);
    await act(() => result.current.onExpandRequest(nodeB));
    expect(result.current.canCollapse("b")).toBe(true);
  });

  it("reset returns to initial state", async () => {
    const fetchNeighbors = vi.fn(async () => ({
      nodes: [nodeC, nodeD],
      edges: [edgeBC, edgeCD],
    }));
    const { result } = renderHook(() =>
      useGraphExploration(makeOptions({ fetchNeighbors })),
    );

    await act(() => result.current.onExpandRequest(nodeB));
    act(() => result.current.onNodeSelect(["a", "c"]));
    expect(ids(result.current.nodes)).toEqual(["a", "b", "c", "d"]);

    act(() => result.current.reset());
    expect(ids(result.current.nodes)).toEqual(["a", "b"]);
    expect(edgeKeys(result.current.edges)).toEqual(["a->b"]);
    expect(result.current.selectedNodeIds).toEqual([]);
    expect(result.current.expandedNodeIds).toEqual([]);
    expect(result.current.expandingNodeId).toBeNull();
  });

  it("manages selection state", () => {
    const { result } = renderHook(() => useGraphExploration(makeOptions()));

    act(() => result.current.onNodeSelect(["a"]));
    expect(result.current.selectedNodeIds).toEqual(["a"]);

    act(() => result.current.onNodeSelect(["a", "b"]));
    expect(result.current.selectedNodeIds).toEqual(["a", "b"]);
  });

  it("prunes selection on collapse", async () => {
    const fetchNeighbors = vi.fn(async () => ({
      nodes: [nodeC],
      edges: [edgeBC],
    }));
    const { result } = renderHook(() =>
      useGraphExploration(makeOptions({ fetchNeighbors })),
    );

    await act(() => result.current.onExpandRequest(nodeB));
    act(() => result.current.onNodeSelect(["a", "c"]));
    expect(result.current.selectedNodeIds).toEqual(["a", "c"]);

    // Collapse B → C removed → selection pruned to ["a"]
    act(() => result.current.collapse("b"));
    expect(result.current.selectedNodeIds).toEqual(["a"]);
  });

  it("sets expandingNodeId during async expansion", async () => {
    let resolveExpand!: (value: { nodes: GraphNode[]; edges: GraphEdge[] }) => void;
    const fetchNeighbors = vi.fn(
      () =>
        new Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>((resolve) => {
          resolveExpand = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useGraphExploration(makeOptions({ fetchNeighbors })),
    );

    // Start expansion — fires async, we don't await it fully
    const expandPromise = result.current.onExpandRequest(nodeB);

    // The expanding state should be set synchronously before the await
    // We need to flush React state updates
    await act(async () => {
      // Give React a tick to process state updates
      await Promise.resolve();
    });
    expect(result.current.expandingNodeId).toBe("b");

    // Resolve the fetch and let expansion complete
    await act(async () => {
      resolveExpand({ nodes: [nodeC], edges: [edgeBC] });
      await expandPromise;
    });

    expect(result.current.expandingNodeId).toBeNull();
  });

  it("blocks concurrent expansions", async () => {
    let resolveFirst!: (value: { nodes: GraphNode[]; edges: GraphEdge[] }) => void;
    const fetchNeighbors = vi.fn(
      () =>
        new Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useGraphExploration(makeOptions({ fetchNeighbors })),
    );

    // Start first expansion
    const firstPromise = result.current.onExpandRequest(nodeB);

    await act(async () => {
      await Promise.resolve();
    });

    // Try second expansion while first is pending
    await act(async () => {
      result.current.onExpandRequest(nodeA);
    });

    // Only the first fetch should have been called
    expect(fetchNeighbors).toHaveBeenCalledTimes(1);

    // Resolve first
    await act(async () => {
      resolveFirst({ nodes: [nodeC], edges: [edgeBC] });
      await firstPromise;
    });
  });

  it("removes dangling edges on collapse", async () => {
    const fetchNeighbors = vi.fn(async () => ({
      nodes: [nodeC],
      edges: [edgeBC, { source: "a", target: "c" } as GraphEdge],
    }));
    const { result } = renderHook(() =>
      useGraphExploration(makeOptions({ fetchNeighbors })),
    );

    await act(() => result.current.onExpandRequest(nodeB));
    expect(edgeKeys(result.current.edges)).toEqual(["a->b", "a->c", "b->c"]);

    act(() => result.current.collapse("b"));
    // C removed → edges to C removed
    expect(edgeKeys(result.current.edges)).toEqual(["a->b"]);
  });

  it("allows re-expansion after collapse", async () => {
    const fetchNeighbors = vi.fn(async () => ({
      nodes: [nodeC],
      edges: [edgeBC],
    }));
    const { result } = renderHook(() =>
      useGraphExploration(makeOptions({ fetchNeighbors })),
    );

    await act(() => result.current.onExpandRequest(nodeB));
    expect(ids(result.current.nodes)).toEqual(["a", "b", "c"]);

    act(() => result.current.collapse("b"));
    expect(ids(result.current.nodes)).toEqual(["a", "b"]);
    expect(result.current.canExpand("b")).toBe(true);

    await act(() => result.current.onExpandRequest(nodeB));
    expect(ids(result.current.nodes)).toEqual(["a", "b", "c"]);
    expect(fetchNeighbors).toHaveBeenCalledTimes(2);
  });
});
