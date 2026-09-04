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
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GraphChart } from "../graph-chart";
import type {
  Node as NvlNode,
  Relationship as NvlRelationship,
} from "@neo4j-nvl/base";

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

  it("gives uncolored edges an explicit mid-grey in dark mode (#1154)", () => {
    document.documentElement.classList.add("dark");
    try {
      render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
      const nvlRels = capturedProps.rels as NvlRelationship[];
      // NVL's default relationship grey nearly vanishes on the dark canvas.
      expect(nvlRels[0].color).toBe("#6a7180");
    } finally {
      document.documentElement.classList.remove("dark");
    }
  });

  it("normalizes explicit edge colors to hex for NVL (#1157)", () => {
    render(
      <GraphChart
        nodes={sampleNodes}
        edges={[
          { source: "1", target: "2", label: "x", color: "hsl(0, 100%, 50%)" },
        ]}
      />,
    );
    const nvlRels = capturedProps.rels as NvlRelationship[];
    expect(nvlRels[0].color).toBe("#ff0000");
  });

  // --- Layout mapping ---

  it("uses forceDirected layout by default", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    expect(capturedProps.layout).toBe("forceDirected");
  });

  it("maps 'force' layout to 'forceDirected'", () => {
    render(
      <GraphChart nodes={sampleNodes} edges={sampleEdges} layout="force" />,
    );
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
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        layout="force"
        initialLayout="circular"
      />,
    );
    expect(capturedProps.layout).toBe("circular");
  });

  it("fires onLayoutChange when layout is changed", async () => {
    const onLayoutChange = vi.fn();
    render(
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        onLayoutChange={onLayoutChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Graph layout"), {
      target: { value: "circular" },
    });
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

  // --- Selection ---

  it("marks nodes in selectedNodeIds as selected on the NVL node", () => {
    render(
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        selectedNodeIds={["2"]}
      />,
    );
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes.find((n) => n.id === "1")?.selected).toBe(false);
    expect(nvlNodes.find((n) => n.id === "2")?.selected).toBe(true);
    expect(nvlNodes.find((n) => n.id === "3")?.selected).toBe(false);
  });

  it("leaves nodes unselected when selectedNodeIds is omitted", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes.every((n) => n.selected === false)).toBe(true);
  });

  it("reflects an updated selectedNodeIds prop on the NVL nodes", () => {
    const { rerender } = render(
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        selectedNodeIds={["1"]}
      />,
    );
    expect(
      (capturedProps.nodes as NvlNode[]).find((n) => n.id === "1")?.selected,
    ).toBe(true);
    rerender(
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        selectedNodeIds={["3"]}
      />,
    );
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes.find((n) => n.id === "1")?.selected).toBe(false);
    expect(nvlNodes.find((n) => n.id === "3")?.selected).toBe(true);
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
      {
        id: "p1",
        labels: ["Person"],
        properties: { name: "Alice" },
        color: "#custom",
      },
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
    const pinnedNodes = [
      { id: "1", label: "Fixed", fixed: true, x: 100, y: 200 },
    ];
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
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        onNodeSelect={onNodeSelect}
      />,
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

  // --- Modifier-aware selection (#1191) ---
  //
  // NVL hands `onNodeClick` three arguments: (node, hitElements, event), where
  // `event` is a DOM MouseEvent (see ClickInteractionCallbacks in
  // @neo4j-nvl/interaction-handlers). A plain click must REPLACE the selection
  // so the single-node property inspector stays reachable; Cmd/Ctrl (and Shift,
  // which has no competing meaning — box/lasso select is not wired up here)
  // toggle into a multi-selection.

  describe("modifier-aware node selection (#1191)", () => {
    type ClickCallback = (
      node: { id: string },
      hitElements: unknown,
      event: Partial<MouseEvent>,
    ) => void;

    /** Render with a controlled selection and return a click driver. */
    function setup(selectedNodeIds: string[]) {
      const onNodeSelect = vi.fn();
      render(
        <GraphChart
          nodes={sampleNodes}
          edges={sampleEdges}
          selectedNodeIds={selectedNodeIds}
          onNodeSelect={onNodeSelect}
        />,
      );
      const onNodeClick = (
        capturedProps.mouseEventCallbacks as { onNodeClick?: ClickCallback }
      ).onNodeClick;
      return {
        onNodeSelect,
        click: (id: string, modifiers: Partial<MouseEvent> = {}) =>
          onNodeClick?.({ id }, undefined, {
            metaKey: false,
            ctrlKey: false,
            shiftKey: false,
            ...modifiers,
          }),
      };
    }

    it("plain click REPLACES a multi-selection with just the clicked node", () => {
      // The core bug: this used to produce ["1", "3", "2"].
      const { onNodeSelect, click } = setup(["1", "3"]);
      click("2");
      expect(onNodeSelect).toHaveBeenCalledWith(["2"]);
    });

    it("plain click on the sole selected node deselects it", () => {
      const { onNodeSelect, click } = setup(["1"]);
      click("1");
      expect(onNodeSelect).toHaveBeenCalledWith([]);
    });

    it("plain click on a selected node that is not the sole selection narrows to it", () => {
      // Only the *sole* selection round-trips to empty; otherwise the user is
      // narrowing a multi-selection down to the node they clicked.
      const { onNodeSelect, click } = setup(["1", "2"]);
      click("1");
      expect(onNodeSelect).toHaveBeenCalledWith(["1"]);
    });

    it("plain click on an unselected node with nothing selected selects only it", () => {
      const { onNodeSelect, click } = setup([]);
      click("2");
      expect(onNodeSelect).toHaveBeenCalledWith(["2"]);
    });

    it("Cmd+click adds a node to the selection", () => {
      const { onNodeSelect, click } = setup(["1"]);
      click("2", { metaKey: true });
      expect(onNodeSelect).toHaveBeenCalledWith(["1", "2"]);
    });

    it("Ctrl+click adds a node to the selection (Windows/Linux)", () => {
      const { onNodeSelect, click } = setup(["1"]);
      click("2", { ctrlKey: true });
      expect(onNodeSelect).toHaveBeenCalledWith(["1", "2"]);
    });

    it("Cmd+click on a selected node removes it from the selection", () => {
      const { onNodeSelect, click } = setup(["1", "2"]);
      click("1", { metaKey: true });
      expect(onNodeSelect).toHaveBeenCalledWith(["2"]);
    });

    it("Ctrl+click on a selected node removes it from the selection", () => {
      const { onNodeSelect, click } = setup(["1", "2"]);
      click("2", { ctrlKey: true });
      expect(onNodeSelect).toHaveBeenCalledWith(["1"]);
    });

    it("Shift+click also toggles (accepted alongside Cmd/Ctrl)", () => {
      const { onNodeSelect, click } = setup(["1"]);
      click("2", { shiftKey: true });
      expect(onNodeSelect).toHaveBeenCalledWith(["1", "2"]);
    });

    it("Shift+click on a selected node removes it from the selection", () => {
      const { onNodeSelect, click } = setup(["1", "2"]);
      click("1", { shiftKey: true });
      expect(onNodeSelect).toHaveBeenCalledWith(["2"]);
    });

    it("plain click always yields exactly one id, keeping the single-node inspector reachable", () => {
      // The inspector in graph-exploration-wrapper opens only for
      // `ids.length === 1`; walking a graph node by node must never exceed it.
      const { onNodeSelect, click } = setup(["1", "2", "3"]);
      click("3");
      const ids = onNodeSelect.mock.calls[0][0] as string[];
      expect(ids).toEqual(["3"]);
    });
  });

  // --- className ---

  it("applies custom className to wrapper when data is present", () => {
    const { container } = render(
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        className="my-graph"
      />,
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
    {
      id: "p1",
      label: "Tom Hanks",
      labels: ["Person"],
      properties: { name: "Tom Hanks", born: 1956 },
    },
    {
      id: "p2",
      label: "Keanu Reeves",
      labels: ["Person"],
      properties: { name: "Keanu Reeves", born: 1964 },
    },
    {
      id: "m1",
      label: "The Matrix",
      labels: ["Movie"],
      properties: {
        title: "The Matrix",
        released: 1999,
        tagline: "Welcome to the Real World",
      },
    },
  ];
  const labeledEdges = [{ source: "p2", target: "m1", label: "ACTED_IN" }];

  it("shows label settings button when nodes have labels", () => {
    render(<GraphChart nodes={labeledNodes} edges={labeledEdges} />);
    expect(screen.getByTestId("label-settings-button")).toBeInTheDocument();
  });

  it("does not show label settings button when nodes have no labels", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    expect(
      screen.queryByTestId("label-settings-button"),
    ).not.toBeInTheDocument();
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
      const personSelect = screen.getByTestId(
        "caption-select-Person",
      ) as HTMLSelectElement;
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
    fireEvent.change(screen.getByTestId("caption-select-Person"), {
      target: { value: "born" },
    });
    // Check that NVL nodes now show born year for Person nodes
    const nvlNodes = capturedProps.nodes as NvlNode[];
    const personNode = nvlNodes.find((n) => n.id === "p1");
    expect(personNode?.caption).toBe("1956");
  });

  it("fires onCaptionMapChange when caption property is changed", async () => {
    const onCaptionMapChange = vi.fn();
    render(
      <GraphChart
        nodes={labeledNodes}
        edges={labeledEdges}
        onCaptionMapChange={onCaptionMapChange}
      />,
    );
    fireEvent.click(screen.getByTestId("label-settings-button"));
    await waitFor(() => {
      expect(screen.getByTestId("caption-select-Person")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByTestId("caption-select-Person"), {
      target: { value: "born" },
    });
    expect(onCaptionMapChange).toHaveBeenCalledWith(
      expect.objectContaining({ Person: "born" }),
    );
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
      {
        id: "x1",
        labels: ["City"],
        properties: { name: "Berlin", population: 3600000 },
      },
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

  // --- New options ---

  it("scales node size down when nodeSize is small", () => {
    const sizedNodes = [{ id: "1", label: "A", value: 40 }];
    render(<GraphChart nodes={sizedNodes} edges={[]} nodeSize="small" />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    // small scale = 0.6 → 40 * 0.6 = 24
    expect(nvlNodes[0].size).toBe(24);
  });

  it("keeps default scale when nodeSize is medium", () => {
    const sizedNodes = [{ id: "1", label: "A", value: 40 }];
    render(<GraphChart nodes={sizedNodes} edges={[]} nodeSize="medium" />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    // medium scale = 1.0 → 40 * 1.0 = 40
    expect(nvlNodes[0].size).toBe(40);
  });

  it("scales node size up when nodeSize is large", () => {
    const sizedNodes = [{ id: "1", label: "A", value: 40 }];
    render(<GraphChart nodes={sizedNodes} edges={[]} nodeSize="large" />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    // large scale = 1.6 → 40 * 1.6 = 64
    expect(nvlNodes[0].size).toBe(64);
  });

  it("includes relationship caption when showRelationshipLabels is true (default)", () => {
    render(
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        showRelationshipLabels
      />,
    );
    const nvlRels = capturedProps.rels as NvlRelationship[];
    expect(nvlRels[0].caption).toBe("knows");
  });

  it("omits relationship caption when showRelationshipLabels is false", () => {
    render(
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        showRelationshipLabels={false}
      />,
    );
    const nvlRels = capturedProps.rels as NvlRelationship[];
    expect(nvlRels[0].caption).toBeUndefined();
  });

  it("sends NVL no useStaticLayout option (#1472)", () => {
    // The old `physics` prop mapped to `useStaticLayout`, which does not exist
    // anywhere in @neo4j-nvl — the toggle it backed never changed a frame, so
    // both the option and the prop were removed. This guards the plumbing from
    // coming back.
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    const opts = capturedProps.nvlOptions as Record<string, unknown>;
    expect("useStaticLayout" in opts).toBe(false);
  });

  // --- Caption rendering for normalized values ---
  // Since PR #92, Neo4j temporal types are normalized at the parser boundary.
  // The component receives plain JS numbers and Date objects.

  it("renders a number property as a numeric string in node caption", () => {
    const nodes = [
      {
        id: "i1",
        labels: ["Item"],
        properties: { count: 42 },
      },
    ];
    render(<GraphChart nodes={nodes} edges={[]} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes[0].caption).toBe("42");
  });

  it("renders a large number property correctly", () => {
    const nodes = [
      {
        id: "i2",
        labels: ["Item"],
        properties: { bigNum: 4294967296 },
      },
    ];
    render(<GraphChart nodes={nodes} edges={[]} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes[0].caption).toBe("4294967296");
  });

  it("renders a Date object as a readable datetime string in node caption", () => {
    const nodes = [
      {
        id: "d1",
        labels: ["Event"],
        properties: {
          date: new Date("2024-03-15T00:00:00Z"),
        },
      },
    ];
    render(<GraphChart nodes={nodes} edges={[]} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes[0].caption).toBe("2024-03-15 00:00:00");
  });

  it("renders a Date with time components correctly", () => {
    const nodes = [
      {
        id: "d2",
        labels: ["Event"],
        properties: {
          date: new Date("2023-11-07T14:30:00Z"),
        },
      },
    ];
    render(<GraphChart nodes={nodes} edges={[]} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes[0].caption).toBe("2023-11-07 14:30:00");
  });

  it("falls back to JSON.stringify for unknown object values", () => {
    const nodes = [
      {
        id: "p1",
        labels: ["Point"],
        properties: { location: { x: 1.5, y: 2.5, srid: 4326 } },
      },
    ];
    render(<GraphChart nodes={nodes} edges={[]} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes[0].caption).toContain("x");
    expect(nvlNodes[0].caption).not.toBe("[object Object]");
  });

  // --- Loading overlay / layoutReady ---

  describe("loading overlay", () => {
    it("shows loading overlay on initial render when nodes are present", () => {
      render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
      expect(screen.getByTestId("graph-loading-overlay")).toBeInTheDocument();
    });

    it("does not show loading overlay when there are no nodes", () => {
      render(<GraphChart nodes={[]} edges={[]} />);
      expect(
        screen.queryByTestId("graph-loading-overlay"),
      ).not.toBeInTheDocument();
    });

    it("removes loading overlay after onLayoutDone fires", () => {
      render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
      expect(screen.getByTestId("graph-loading-overlay")).toBeInTheDocument();

      // Simulate NVL calling onLayoutDone
      const callbacks = capturedProps.nvlCallbacks as {
        onLayoutDone?: () => void;
      };
      act(() => {
        callbacks.onLayoutDone?.();
      });

      expect(
        screen.queryByTestId("graph-loading-overlay"),
      ).not.toBeInTheDocument();
    });

    it("resets loading overlay when nodes change", () => {
      const { rerender } = render(
        <GraphChart nodes={sampleNodes} edges={sampleEdges} />,
      );

      // Fire onLayoutDone to clear overlay
      const callbacks = capturedProps.nvlCallbacks as {
        onLayoutDone?: () => void;
      };
      act(() => {
        callbacks.onLayoutDone?.();
      });
      expect(
        screen.queryByTestId("graph-loading-overlay"),
      ).not.toBeInTheDocument();

      // Change nodes — overlay should reappear
      const newNodes = [
        { id: "4", label: "Diana", value: 10 },
        { id: "5", label: "Eve", value: 15 },
      ];
      rerender(<GraphChart nodes={newNodes} edges={[]} />);
      expect(screen.getByTestId("graph-loading-overlay")).toBeInTheDocument();
    });
  });

  // --- nvlOptions ---

  it("disables web workers in nvlOptions (Next.js bundler compatibility)", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    const opts = capturedProps.nvlOptions as Record<string, unknown>;
    expect(opts.disableWebWorkers).toBe(true);
  });

  // --- autoFit ---

  describe("autoFit", () => {
    it("does not call fitGraph before onLayoutDone fires", () => {
      // We can't directly spy on fitGraph, but we can verify through the nvlRef.
      // The NVL wrapper is mocked, so we check that autoFit alone doesn't
      // cause immediate side effects — the overlay should still be visible.
      render(<GraphChart nodes={sampleNodes} edges={sampleEdges} autoFit />);
      // Overlay is still present — layout hasn't completed
      expect(screen.getByTestId("graph-loading-overlay")).toBeInTheDocument();
    });

    it("calls fitGraph (via onLayoutDone) when autoFit and layout completes", () => {
      render(<GraphChart nodes={sampleNodes} edges={sampleEdges} autoFit />);
      // Fire onLayoutDone
      const callbacks = capturedProps.nvlCallbacks as {
        onLayoutDone?: () => void;
      };
      act(() => {
        callbacks.onLayoutDone?.();
      });
      // Overlay should be gone — fitGraph was called
      expect(
        screen.queryByTestId("graph-loading-overlay"),
      ).not.toBeInTheDocument();
    });
  });

  describe("rule-based styling", () => {
    const styledNodes = [
      { id: "1", label: "Alice", value: 10, labels: ["Person"] },
      { id: "2", label: "Bob", value: 50, labels: ["Person"] },
      { id: "3", label: "Charlie", value: 90, labels: ["Person"] },
    ];

    it("applies styling rule color to nodes matching the rule", () => {
      const rules = [
        { id: "r1", operator: ">=" as const, value: 50, color: "#ff0000" },
      ];
      render(
        <GraphChart nodes={styledNodes} edges={[]} stylingRules={rules} />,
      );
      const nvlNodes = capturedProps.nodes as Array<{
        id: string;
        color?: string;
      }>;
      // Node "2" (value=50) and "3" (value=90) match >= 50
      expect(nvlNodes.find((n) => n.id === "2")?.color).toBe("#ff0000");
      expect(nvlNodes.find((n) => n.id === "3")?.color).toBe("#ff0000");
      // Node "1" (value=10) does NOT match — falls back to palette
      expect(nvlNodes.find((n) => n.id === "1")?.color).not.toBe("#ff0000");
    });

    it("styling rule takes priority over explicit node.color", () => {
      const nodesWithColor = [
        { id: "1", label: "X", value: 100, color: "#00ff00" },
      ];
      const rules = [
        { id: "r1", operator: ">=" as const, value: 50, color: "#ff0000" },
      ];
      render(
        <GraphChart nodes={nodesWithColor} edges={[]} stylingRules={rules} />,
      );
      const nvlNodes = capturedProps.nodes as Array<{
        id: string;
        color?: string;
      }>;
      expect(nvlNodes[0].color).toBe("#ff0000");
    });

    it("does not apply styling when node has no value", () => {
      const noValueNodes = [{ id: "1", label: "NoVal", labels: ["Thing"] }];
      const rules = [
        { id: "r1", operator: ">=" as const, value: 0, color: "#ff0000" },
      ];
      render(
        <GraphChart nodes={noValueNodes} edges={[]} stylingRules={rules} />,
      );
      const nvlNodes = capturedProps.nodes as Array<{
        id: string;
        color?: string;
      }>;
      // No value → rule not evaluated → palette color
      expect(nvlNodes[0].color).not.toBe("#ff0000");
    });
  });

  // --- Safety timeout for layout ---

  describe("layout safety timeout", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("forces layoutReady after 800ms when onLayoutDone never fires", () => {
      render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
      // Loading overlay is shown initially
      expect(screen.getByTestId("graph-loading-overlay")).toBeInTheDocument();

      // Advance time by 800ms — the safety timeout should fire
      act(() => {
        vi.advanceTimersByTime(800);
      });

      // Overlay should be removed
      expect(
        screen.queryByTestId("graph-loading-overlay"),
      ).not.toBeInTheDocument();
    });

    it("does not force layoutReady before 800ms", () => {
      render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
      expect(screen.getByTestId("graph-loading-overlay")).toBeInTheDocument();

      // Advance to just before the timeout
      act(() => {
        vi.advanceTimersByTime(799);
      });

      // Overlay should still be visible
      expect(screen.getByTestId("graph-loading-overlay")).toBeInTheDocument();
    });

    it("safety timeout is a no-op when onLayoutDone fires first", () => {
      render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
      expect(screen.getByTestId("graph-loading-overlay")).toBeInTheDocument();

      // Simulate NVL calling onLayoutDone before the timeout
      const callbacks = capturedProps.nvlCallbacks as {
        onLayoutDone?: () => void;
      };
      act(() => {
        callbacks.onLayoutDone?.();
      });

      // Overlay is already gone
      expect(
        screen.queryByTestId("graph-loading-overlay"),
      ).not.toBeInTheDocument();

      // Advancing past 800ms should not cause errors or re-show overlay
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(
        screen.queryByTestId("graph-loading-overlay"),
      ).not.toBeInTheDocument();
    });

    it("does not start safety timeout when nodes are empty", () => {
      render(<GraphChart nodes={[]} edges={[]} />);

      // No overlay at all for empty nodes
      expect(
        screen.queryByTestId("graph-loading-overlay"),
      ).not.toBeInTheDocument();

      // Advancing time should not cause any issues
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(
        screen.queryByTestId("graph-loading-overlay"),
      ).not.toBeInTheDocument();
    });

    it("cleans up timeout on unmount to prevent state update on unmounted component", () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
      const { unmount } = render(
        <GraphChart nodes={sampleNodes} edges={sampleEdges} />,
      );

      // Unmount before timeout fires
      unmount();

      // clearTimeout should have been called (cleanup function ran)
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  // --- Zoom controls + node count ---

  describe("zoom controls and node count", () => {
    it("renders zoom-in, zoom-out, and fit buttons in the toolbar", () => {
      render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
      expect(screen.getByLabelText("Zoom in")).toBeInTheDocument();
      expect(screen.getByLabelText("Zoom out")).toBeInTheDocument();
      expect(screen.getByLabelText("Fit graph")).toBeInTheDocument();
    });

    it("renders the node count display with pluralized labels", () => {
      render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
      // 3 nodes, 2 edges from sample data
      const count = screen.getByTestId("graph-node-count");
      expect(count).toHaveTextContent("3 nodes, 2 edges");
    });

    it("uses singular labels when there is exactly one node and one edge", () => {
      const oneNode = [{ id: "1", label: "Only" }];
      const oneEdge = [{ source: "1", target: "1", label: "self" }];
      render(<GraphChart nodes={oneNode} edges={oneEdge} />);
      const count = screen.getByTestId("graph-node-count");
      expect(count).toHaveTextContent("1 node, 1 edge");
    });

    // #1521 — the wrapper renders its own status bar, so the chart's overlay
    // pill has to be suppressible or the same counts show up twice.
    it("hides the node count when showNodeCount is false", () => {
      render(
        <GraphChart
          nodes={sampleNodes}
          edges={sampleEdges}
          showNodeCount={false}
        />,
      );
      expect(screen.queryByTestId("graph-node-count")).not.toBeInTheDocument();
    });

    it("still shows the node count when showNodeCount is omitted", () => {
      render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
      expect(screen.getByTestId("graph-node-count")).toBeInTheDocument();
    });

    it("keeps the zoom toolbar when the count is hidden", () => {
      render(
        <GraphChart
          nodes={sampleNodes}
          edges={sampleEdges}
          showNodeCount={false}
        />,
      );
      expect(screen.getByLabelText("Zoom in")).toBeInTheDocument();
      expect(screen.getByLabelText("Fit graph")).toBeInTheDocument();
    });

    it("updates the node count when nodes and edges change", () => {
      const { rerender } = render(
        <GraphChart nodes={sampleNodes} edges={sampleEdges} />,
      );
      expect(screen.getByTestId("graph-node-count")).toHaveTextContent(
        "3 nodes, 2 edges",
      );
      const moreNodes = [
        ...sampleNodes,
        { id: "4", label: "Dan" },
        { id: "5", label: "Eve" },
      ];
      rerender(<GraphChart nodes={moreNodes} edges={sampleEdges} />);
      expect(screen.getByTestId("graph-node-count")).toHaveTextContent(
        "5 nodes, 2 edges",
      );
    });

    it("clicking zoom-in does not throw when NVL ref has not yet been attached", () => {
      render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
      // The NVL wrapper is mocked so nvlRef.current is null.
      // Zoom buttons must safely no-op instead of throwing.
      expect(() =>
        fireEvent.click(screen.getByTestId("graph-zoom-in")),
      ).not.toThrow();
      expect(() =>
        fireEvent.click(screen.getByTestId("graph-zoom-out")),
      ).not.toThrow();
    });
  });

  // --- Synthetic (APOC virtual) nodes (#1361) ---

  describe("synthetic nodes", () => {
    const mixedNodes = [
      { id: "4:1a7aa765-ebcb-4a7b-9859-ca21d0d78e50:0", label: "Document" },
      { id: "-289", label: "Totals", synthetic: true },
    ];

    function captionValues(node: NvlNode): (string | undefined)[] {
      return (node.captions ?? []).map((c) => c.value);
    }

    it("gives a synthetic node a distinct italic 'virtual' caption line", () => {
      render(<GraphChart nodes={mixedNodes} edges={[]} />);
      const nvlNodes = capturedProps.nodes as NvlNode[];
      const synthetic = nvlNodes.find((n) => n.id === "-289")!;

      expect(captionValues(synthetic)).toContain("virtual");
      expect(
        synthetic.captions?.find((c) => c.value === "virtual")?.styles,
      ).toContain("italic");
    });

    it("keeps the node's own caption alongside the marker", () => {
      render(<GraphChart nodes={mixedNodes} edges={[]} />);
      const nvlNodes = capturedProps.nodes as NvlNode[];
      const synthetic = nvlNodes.find((n) => n.id === "-289")!;
      expect(captionValues(synthetic)).toEqual(["Totals", "virtual"]);
    });

    it("does not mark a real node", () => {
      render(<GraphChart nodes={mixedNodes} edges={[]} />);
      const nvlNodes = capturedProps.nodes as NvlNode[];
      const real = nvlNodes.find((n) => n.id !== "-289")!;
      expect(real.captions).toBeUndefined();
      expect(real.caption).toBe("Document");
    });

    it("still marks a synthetic node when captions are turned off", () => {
      // showLabels=false hides every caption, but "this is not a real node"
      // is not a label — it must survive.
      render(<GraphChart nodes={mixedNodes} edges={[]} showLabels={false} />);
      const nvlNodes = capturedProps.nodes as NvlNode[];
      const synthetic = nvlNodes.find((n) => n.id === "-289")!;
      expect(captionValues(synthetic)).toEqual(["virtual"]);
    });
  });
});
