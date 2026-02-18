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
import { render, screen, cleanup } from "@testing-library/react";
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

  it("passes node color to NVL node", () => {
    const coloredNodes = [{ id: "1", label: "Red", color: "#ff0000" }];
    render(<GraphChart nodes={coloredNodes} edges={[]} />);
    const nvlNodes = capturedProps.nodes as NvlNode[];
    expect(nvlNodes[0].color).toBe("#ff0000");
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
});
