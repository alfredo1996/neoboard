import { describe, it, expect, beforeEach } from "vitest";
import { useGraphWidgetStore } from "../graph-widget-store";

describe("useGraphWidgetStore", () => {
  beforeEach(() => {
    useGraphWidgetStore.setState({ states: {} });
  });

  it("initializes with empty states", () => {
    expect(useGraphWidgetStore.getState().states).toEqual({});
  });

  it("setState creates new widget state", () => {
    const nodes = [{ id: "n1", labels: ["Person"], properties: {} }];
    const edges = [{ id: "e1", from: "n1", to: "n2", type: "KNOWS", properties: {} }];
    useGraphWidgetStore.getState().setState("w1", { nodes, edges });
    const state = useGraphWidgetStore.getState().states["w1"];
    expect(state.nodes).toEqual(nodes);
    expect(state.edges).toEqual(edges);
  });

  it("setState partially merges into existing state", () => {
    useGraphWidgetStore.getState().setState("w1", {
      nodes: [{ id: "n1", labels: [], properties: {} }],
      edges: [],
      layout: "force",
    });
    // Update only layout, preserve nodes and edges
    useGraphWidgetStore.getState().setState("w1", { layout: "hierarchical" });
    const state = useGraphWidgetStore.getState().states["w1"];
    expect(state.layout).toBe("hierarchical");
    expect(state.nodes).toHaveLength(1);
    expect(state.edges).toHaveLength(0);
  });

  it("setState on new widget does not affect other widgets", () => {
    useGraphWidgetStore.getState().setState("w1", {
      nodes: [{ id: "n1", labels: [], properties: {} }],
      edges: [],
    });
    useGraphWidgetStore.getState().setState("w2", {
      nodes: [{ id: "n2", labels: [], properties: {} }],
      edges: [],
    });
    expect(useGraphWidgetStore.getState().states["w1"].nodes[0].id).toBe("n1");
    expect(useGraphWidgetStore.getState().states["w2"].nodes[0].id).toBe("n2");
  });

  it("setState updates resultId for stale detection", () => {
    useGraphWidgetStore.getState().setState("w1", { nodes: [], edges: [], resultId: "abc123" });
    expect(useGraphWidgetStore.getState().states["w1"].resultId).toBe("abc123");

    useGraphWidgetStore.getState().setState("w1", { resultId: "def456" });
    expect(useGraphWidgetStore.getState().states["w1"].resultId).toBe("def456");
    // nodes/edges preserved
    expect(useGraphWidgetStore.getState().states["w1"].nodes).toEqual([]);
  });

  it("setState handles captionMap", () => {
    useGraphWidgetStore.getState().setState("w1", {
      nodes: [],
      edges: [],
      captionMap: { Person: "name", Movie: "title" },
    });
    expect(useGraphWidgetStore.getState().states["w1"].captionMap).toEqual({
      Person: "name",
      Movie: "title",
    });
  });
});
