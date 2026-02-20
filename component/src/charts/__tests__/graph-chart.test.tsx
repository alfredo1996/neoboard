/**
 * GraphChart tests — NVL-based implementation.
 *
 * NVL uses WebGL/Canvas which does not work in jsdom.
 * We mock @neo4j-nvl/react and test the wrapper logic:
 *   - Empty state rendering
 *   - Node/edge mapping passed to NVL
 *   - Click callback wiring
 *   - Layout mapping
 */
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GraphChart } from "../graph-chart";
import type { Node as NvlNode, Relationship as NvlRelationship } from "@neo4j-nvl/base";

/** Capture the last set of props passed to InteractiveNvlWrapper */
let capturedProps: Record<string, unknown> = {};

vi.mock("@neo4j-nvl/react", () => ({
  InteractiveNvlWrapper: vi.fn((props: Record<string, unknown>) => {
    capturedProps = props;
    return <div data-testid="nvl-wrapper" />;
  }),
}));

const sampleNodes = [
  { id: "1", label: "Alice", value: 30 },
  { id: "2", label: "Bob", value: 20 },
  { id: "3", label: "Charlie", value: 40 },
];

const sampleEdges = [
  { source: "1", target: "2", label: "knows" },
  { source: "2", target: "3", label: "works_with" },
];

describe("GraphChart", () => {
  beforeEach(() => {
    capturedProps = {};
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // --- Empty state ---

  it("shows 'No graph data' message when nodes array is empty", () => {
    render(<GraphChart nodes={[]} edges={[]} />);
    expect(screen.getByText("No graph data")).toBeInTheDocument();
    expect(screen.queryByTestId("nvl-wrapper")).not.toBeInTheDocument();
  });

  it("empty state message mentions Cypher/Neo4j to guide the user", () => {
    render(<GraphChart nodes={[]} edges={[]} />);
    expect(screen.getByText(/cypher/i)).toBeInTheDocument();
  });

  // --- NVL rendering ---

  it("renders NVL wrapper when nodes are present", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    expect(screen.getByTestId("nvl-wrapper")).toBeInTheDocument();
  });

  it("maps GraphNodes to NVL nodes with caption from label", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes).toHaveLength(3);
    expect(nvlNodes[0].id).toBe("1");
    expect(nvlNodes[0].caption).toBe("Alice");
  });

  it("maps GraphEdges to NVL relationships with from/to", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    const nvlRels = capturedProps.rels as NvlRelationship[];
    expect(nvlRels).toHaveLength(2);
    expect(nvlRels[0].from).toBe("1");
    expect(nvlRels[0].to).toBe("2");
  });

  it("generates stable IDs for NVL relationships", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    const nvlRels = capturedProps.rels as NvlRelationship[];
    expect(nvlRels[0].id).toMatch(/rel-1-2/);
    expect(nvlRels[1].id).toMatch(/rel-2-3/);
  });

  it("maps edge label to NVL relationship caption and type", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    const nvlRels = capturedProps.rels as NvlRelationship[];
    expect(nvlRels[0].caption).toBe("knows");
    expect(nvlRels[0].type).toBe("knows");
  });

  // --- Layout mapping ---

  it("uses forceDirected layout by default", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    expect(capturedProps.layout).toBe("forceDirected");
  });

  it("maps 'force' layout to 'forceDirected'", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} layout="force" />);
    expect(capturedProps.layout).toBe("forceDirected");
  });

  it("maps 'circular' layout to 'circular'", () => {
    render(
      <GraphChart nodes={sampleNodes} edges={sampleEdges} layout="circular" />,
    );
    expect(capturedProps.layout).toBe("circular");
  });

  it("seeds layout state from initialLayout prop", () => {
    render(
      <GraphChart nodes={sampleNodes} edges={sampleEdges} layout="force" initialLayout="circular" />,
    );
    expect(capturedProps.layout).toBe("circular");
  });

  it("fires onLayoutChange when layout is changed", async () => {
    const onLayoutChange = vi.fn();
    render(
      <GraphChart nodes={sampleNodes} edges={sampleEdges} onLayoutChange={onLayoutChange} />,
    );
    fireEvent.change(screen.getByLabelText("Graph layout"), { target: { value: "circular" } });
    expect(onLayoutChange).toHaveBeenCalledWith("circular");
  });

  // --- Labels ---

  it("includes caption on nodes when showLabels is true (default)", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} showLabels />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes[0].caption).toBe("Alice");
  });

  it("omits caption on nodes when showLabels is false", () => {
    render(
      <GraphChart nodes={sampleNodes} edges={sampleEdges} showLabels={false} />,
    );
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes[0].caption).toBeUndefined();
  });

  // --- Node color ---

  it("passes explicit node color to NVL node", () => {
    const coloredNodes = [{ id: "1", label: "Red", color: "#ff0000" }];
    render(<GraphChart nodes={coloredNodes} edges={[]} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes[0].color).toBe("#ff0000");
  });

  it("assigns palette colors to nodes based on their labels", () => {
    const mixedNodes = [
      { id: "p1", labels: ["Person"], properties: { name: "Alice" } },
      { id: "m1", labels: ["Movie"], properties: { title: "Inception" } },
    ];
    render(<GraphChart nodes={mixedNodes} edges={[]} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    const personColor = nvlNodes.find((n) => n.id === "p1")?.color;
    const movieColor = nvlNodes.find((n) => n.id === "m1")?.color;
    // Both should have a color assigned
    expect(personColor).toBeTruthy();
    expect(movieColor).toBeTruthy();
    // Different labels get different colors
    expect(personColor).not.toBe(movieColor);
  });

  it("assigns the same color to nodes sharing the same label", () => {
    const nodes = [
      { id: "p1", labels: ["Person"], properties: { name: "Alice" } },
      { id: "p2", labels: ["Person"], properties: { name: "Bob" } },
    ];
    render(<GraphChart nodes={nodes} edges={[]} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes[0].color).toBe(nvlNodes[1].color);
  });

  it("uses the last label to determine color when a node has multiple labels", () => {
    const nodes = [
      { id: "a1", labels: ["Actor", "Person"], properties: { name: "Keanu" } },
      { id: "p1", labels: ["Person"], properties: { name: "Bob" } },
    ];
    render(<GraphChart nodes={nodes} edges={[]} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    const actorPersonColor = nvlNodes.find((n) => n.id === "a1")?.color;
    const personOnlyColor = nvlNodes.find((n) => n.id === "p1")?.color;
    // "Actor|Person" node uses "Person" (last label) — same color as a plain Person
    expect(actorPersonColor).toBe(personOnlyColor);
  });

  it("explicit node.color takes precedence over label-derived color", () => {
    const nodes = [
      { id: "p1", labels: ["Person"], properties: { name: "Alice" }, color: "#custom" },
    ];
    render(<GraphChart nodes={nodes} edges={[]} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes[0].color).toBe("#custom");
  });

  it("nodes without labels have no color assigned from palette", () => {
    const nodes = [{ id: "x1", label: "Unlabeled" }];
    render(<GraphChart nodes={nodes} edges={[]} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes[0].color).toBeUndefined();
  });

  // --- Node size ---

  it("maps node value to NVL node size within [20, 60] range", () => {
    const smallNodes = [{ id: "1", label: "Tiny", value: 5 }];
    const largeNodes = [{ id: "2", label: "Huge", value: 9999 }];
    render(<GraphChart nodes={smallNodes} edges={[]} />);
    const smallNvlNodes = capturedProps.nodes as NvlNode[];
    expect(smallNvlNodes[0].size).toBe(20);

    cleanup();
    render(<GraphChart nodes={largeNodes} edges={[]} />);
    const largeNvlNodes = capturedProps.nodes as NvlNode[];
    expect(largeNvlNodes[0].size).toBe(60);
  });

  // --- Pinned nodes ---

  it("maps fixed=true to NVL pinned=true", () => {
    const pinnedNodes = [{ id: "1", label: "Fixed", fixed: true, x: 100, y: 200 }];
    render(<GraphChart nodes={pinnedNodes} edges={[]} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes[0].pinned).toBe(true);
    expect(nvlNodes[0].x).toBe(100);
    expect(nvlNodes[0].y).toBe(200);
  });

  // --- Click events ---

  it("wires onNodeClick to toggle node selection", () => {
    const onNodeSelect = vi.fn();
    render(
      <GraphChart nodes={sampleNodes} edges={sampleEdges} onNodeSelect={onNodeSelect} />,
    );
    const callbacks = capturedProps.mouseEventCallbacks as {
      onNodeClick?: (node: { id: string }) => void;
    };
    callbacks.onNodeClick?.({ id: "1" });
    expect(onNodeSelect).toHaveBeenCalledWith(["1"]);
  });

  it("deselects node if already selected", () => {
    const onNodeSelect = vi.fn();
    render(
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        selectedNodeIds={["1"]}
        onNodeSelect={onNodeSelect}
      />,
    );
    const callbacks = capturedProps.mouseEventCallbacks as {
      onNodeClick?: (node: { id: string }) => void;
    };
    callbacks.onNodeClick?.({ id: "1" });
    expect(onNodeSelect).toHaveBeenCalledWith([]);
  });

  it("does not call onNodeSelect when no handler provided", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    const callbacks = capturedProps.mouseEventCallbacks as {
      onNodeClick?: (node: { id: string }) => void;
    };
    // Should not throw when called without handler
    expect(() => callbacks.onNodeClick?.({ id: "1" })).not.toThrow();
  });

  // --- className ---

  it("applies custom className to wrapper when data is present", () => {
    const { container } = render(
      <GraphChart nodes={sampleNodes} edges={sampleEdges} className="my-graph" />,
    );
    expect(container.firstChild).toHaveClass("my-graph");
  });

  it("applies custom className to wrapper when showing empty state", () => {
    const { container } = render(
      <GraphChart nodes={[]} edges={[]} className="my-empty-graph" />,
    );
    expect(container.firstChild).toHaveClass("my-empty-graph");
  });

  // --- Label property selector ---

  const labeledNodes = [
    { id: "p1", label: "Tom Hanks", labels: ["Person"], properties: { name: "Tom Hanks", born: 1956 } },
    { id: "p2", label: "Keanu Reeves", labels: ["Person"], properties: { name: "Keanu Reeves", born: 1964 } },
    { id: "m1", label: "The Matrix", labels: ["Movie"], properties: { title: "The Matrix", released: 1999, tagline: "Welcome to the Real World" } },
  ];
  const labeledEdges = [
    { source: "p2", target: "m1", label: "ACTED_IN" },
  ];

  it("shows label settings button when nodes have labels", () => {
    render(<GraphChart nodes={labeledNodes} edges={labeledEdges} />);
    expect(screen.getByTestId("label-settings-button")).toBeInTheDocument();
  });

  it("does not show label settings button when nodes have no labels", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    expect(screen.queryByTestId("label-settings-button")).not.toBeInTheDocument();
  });

  it("opens label settings panel when button is clicked", async () => {
    render(<GraphChart nodes={labeledNodes} edges={labeledEdges} />);
    fireEvent.click(screen.getByTestId("label-settings-button"));
    await waitFor(() => {
      expect(screen.getByTestId("label-settings-panel")).toBeInTheDocument();
    });
  });

  it("shows a caption selector for each Neo4j label", async () => {
    render(<GraphChart nodes={labeledNodes} edges={labeledEdges} />);
    fireEvent.click(screen.getByTestId("label-settings-button"));
    await waitFor(() => {
      expect(screen.getByTestId("caption-select-Person")).toBeInTheDocument();
      expect(screen.getByTestId("caption-select-Movie")).toBeInTheDocument();
    });
  });

  it("lists property keys as options in the caption selector", async () => {
    render(<GraphChart nodes={labeledNodes} edges={labeledEdges} />);
    fireEvent.click(screen.getByTestId("label-settings-button"));
    await waitFor(() => {
      const personSelect = screen.getByTestId("caption-select-Person") as HTMLSelectElement;
      const options = Array.from(personSelect.options).map((o) => o.value);
      expect(options).toContain("name");
      expect(options).toContain("born");
    });
  });

  it("defaults caption to 'name' for Person and 'title' for Movie", () => {
    render(<GraphChart nodes={labeledNodes} edges={labeledEdges} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    const personNode = nvlNodes.find((n) => n.id === "p1");
    const movieNode = nvlNodes.find((n) => n.id === "m1");
    expect(personNode?.caption).toBe("Tom Hanks");
    expect(movieNode?.caption).toBe("The Matrix");
  });

  it("updates node captions when caption property is changed", async () => {
    render(<GraphChart nodes={labeledNodes} edges={labeledEdges} />);
    fireEvent.click(screen.getByTestId("label-settings-button"));
    await waitFor(() => {
      expect(screen.getByTestId("caption-select-Person")).toBeInTheDocument();
    });
    // Change Person caption to 'born'
    fireEvent.change(screen.getByTestId("caption-select-Person"), { target: { value: "born" } });
    // Check that NVL nodes now show born year for Person nodes
    const nvlNodes = capturedProps.nodes as NvlNode[];
    const personNode = nvlNodes.find((n) => n.id === "p1");
    expect(personNode?.caption).toBe("1956");
  });

  it("fires onCaptionMapChange when caption property is changed", async () => {
    const onCaptionMapChange = vi.fn();
    render(<GraphChart nodes={labeledNodes} edges={labeledEdges} onCaptionMapChange={onCaptionMapChange} />);
    fireEvent.click(screen.getByTestId("label-settings-button"));
    await waitFor(() => {
      expect(screen.getByTestId("caption-select-Person")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("caption-select-Person"), { target: { value: "born" } });
    expect(onCaptionMapChange).toHaveBeenCalledWith(expect.objectContaining({ Person: "born" }));
  });

  it("seeds captionMap from initialCaptionMap prop", () => {
    render(
      <GraphChart
        nodes={labeledNodes}
        edges={labeledEdges}
        initialCaptionMap={{ Person: "born", Movie: "title" }}
      />,
    );
    const nvlNodes = capturedProps.nodes as NvlNode[];
    const personNode = nvlNodes.find((n) => n.id === "p1");
    // Should use 'born' (1956) instead of default 'name'
    expect(personNode?.caption).toBe("1956");
  });

  it("resolves caption from properties even without label settings interaction", () => {
    // Nodes with labels + properties should auto-resolve via default captionMap
    const nodesWithProps = [
      { id: "x1", labels: ["City"], properties: { name: "Berlin", population: 3600000 } },
    ];
    render(<GraphChart nodes={nodesWithProps} edges={[]} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes[0].caption).toBe("Berlin");
  });

  it("falls back to node.label when no captionMap match", () => {
    // Nodes without labels array use the fallback label field
    const fallbackNodes = [{ id: "z1", label: "Fallback Label" }];
    render(<GraphChart nodes={fallbackNodes} edges={[]} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes[0].caption).toBe("Fallback Label");
  });
});
