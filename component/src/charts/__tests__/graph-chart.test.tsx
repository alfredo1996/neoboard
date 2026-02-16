import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRef } from "react";
import { GraphChart } from "../graph-chart";
import type { GraphChartRef } from "../graph-chart";

const mockSetOption = vi.fn();
const mockDispatchAction = vi.fn();
const mockOn = vi.fn();
const mockOff = vi.fn();

vi.mock("echarts/core", () => {
  const use = vi.fn();
  const init = vi.fn(() => ({
    setOption: mockSetOption,
    resize: vi.fn(),
    dispose: vi.fn(),
    on: mockOn,
    off: mockOff,
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
    dispatchAction: mockDispatchAction,
  }));
  return { use, init, default: { use, init } };
});

vi.mock("echarts/charts", () => ({
  BarChart: vi.fn(),
  LineChart: vi.fn(),
  PieChart: vi.fn(),
  GraphChart: vi.fn(),
}));

vi.mock("echarts/components", () => ({
  TitleComponent: vi.fn(),
  TooltipComponent: vi.fn(),
  LegendComponent: vi.fn(),
  GridComponent: vi.fn(),
  DataZoomComponent: vi.fn(),
}));

vi.mock("echarts/renderers", () => ({
  CanvasRenderer: vi.fn(),
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
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders without errors", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(
      <GraphChart nodes={sampleNodes} edges={sampleEdges} className="my-graph" />,
    );
    expect(screen.getByTestId("base-chart")).toHaveClass("my-graph");
  });

  it("builds graph series with nodes and edges", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].type).toBe("graph");
    expect(optionsCall.series[0].data).toHaveLength(3);
    expect(optionsCall.series[0].edges).toHaveLength(2);
  });

  it("uses force layout by default", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].layout).toBe("force");
    expect(optionsCall.series[0].force).toBeDefined();
  });

  it("supports circular layout", () => {
    render(
      <GraphChart nodes={sampleNodes} edges={sampleEdges} layout="circular" />,
    );
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].layout).toBe("circular");
  });

  it("supports categories", () => {
    render(
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        categories={["Person", "Company"]}
      />,
    );
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].categories).toEqual([
      { name: "Person" },
      { name: "Company" },
    ]);
    expect(optionsCall.legend).toBeDefined();
  });

  it("hides labels when showLabels is false", () => {
    render(
      <GraphChart nodes={sampleNodes} edges={sampleEdges} showLabels={false} />,
    );
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].label.show).toBe(false);
  });

  it("handles empty nodes", () => {
    render(<GraphChart nodes={[]} edges={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.title.text).toBe("No data");
  });

  it("shows loading state", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} loading />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        error={new Error("Network error")}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Network error");
  });

  // --- New feature tests ---

  it("applies selection styling to selected nodes", () => {
    render(
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        selectedNodeIds={["1"]}
      />,
    );
    const optionsCall = mockSetOption.mock.calls[0][0];
    const node1 = optionsCall.series[0].data.find((d: { id: string }) => d.id === "1");
    const node2 = optionsCall.series[0].data.find((d: { id: string }) => d.id === "2");
    expect(node1.itemStyle.borderColor).toBe("#3b82f6");
    expect(node1.itemStyle.borderWidth).toBe(3);
    expect(node1.itemStyle.shadowBlur).toBe(10);
    expect(node2.itemStyle.borderColor).toBeUndefined();
  });

  it("applies custom node colors", () => {
    const coloredNodes = [
      { id: "1", label: "Red", color: "#ff0000" },
      { id: "2", label: "Green", color: "#00ff00" },
    ];
    render(<GraphChart nodes={coloredNodes} edges={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].data[0].itemStyle.color).toBe("#ff0000");
    expect(optionsCall.series[0].data[1].itemStyle.color).toBe("#00ff00");
  });

  it("applies custom edge colors", () => {
    const coloredEdges = [
      { source: "1", target: "2", color: "#ff0000" },
    ];
    render(<GraphChart nodes={sampleNodes} edges={coloredEdges} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].edges[0].lineStyle.color).toBe("#ff0000");
  });

  it("passes node properties for tooltip rendering", () => {
    const nodesWithProps = [
      { id: "1", label: "Alice", properties: { age: 30, role: "Engineer" } },
    ];
    render(<GraphChart nodes={nodesWithProps} edges={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const nodeData = optionsCall.series[0].data[0];
    expect(nodeData.properties).toEqual({ age: 30, role: "Engineer" });
  });

  it("passes fixed/x/y for pinned nodes", () => {
    const pinnedNodes = [
      { id: "1", label: "Fixed", fixed: true, x: 100, y: 200 },
    ];
    render(<GraphChart nodes={pinnedNodes} edges={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].data[0].fixed).toBe(true);
    expect(optionsCall.series[0].data[0].x).toBe(100);
    expect(optionsCall.series[0].data[0].y).toBe(200);
  });

  it("applies custom edgeStyle", () => {
    render(
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        edgeStyle={{ curveness: 0.3, width: 2, opacity: 0.5 }}
      />,
    );
    const optionsCall = mockSetOption.mock.calls[0][0];
    const lineStyle = optionsCall.series[0].lineStyle;
    expect(lineStyle.curveness).toBe(0.3);
    expect(lineStyle.width).toBe(2);
    expect(lineStyle.opacity).toBe(0.5);
  });

  it("exposes zoomToFit via ref", () => {
    const ref = createRef<GraphChartRef>();
    render(
      <GraphChart nodes={sampleNodes} edges={sampleEdges} ref={ref} />,
    );
    expect(ref.current).toBeDefined();
    ref.current!.zoomToFit();
    expect(mockDispatchAction).toHaveBeenCalledWith({ type: "restore" });
  });

  it("registers dblclick, contextmenu, and click event handlers", () => {
    render(
      <GraphChart
        nodes={sampleNodes}
        edges={sampleEdges}
        onNodeDoubleClick={vi.fn()}
        onNodeRightClick={vi.fn()}
        onNodeSelect={vi.fn()}
      />,
    );
    const eventNames = mockOn.mock.calls.map((c: unknown[]) => c[0]);
    expect(eventNames).toContain("dblclick");
    expect(eventNames).toContain("contextmenu");
    expect(eventNames).toContain("click");
  });

  it("tooltip formatter renders properties as key-value lines", () => {
    const nodesWithProps = [
      { id: "1", label: "Alice", properties: { age: 30, city: "NYC" } },
    ];
    render(<GraphChart nodes={nodesWithProps} edges={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const formatter = optionsCall.tooltip.formatter;
    const result = formatter({
      dataType: "node",
      name: "Alice",
      data: { nodeLabel: "Alice", properties: { age: 30, city: "NYC" } },
    });
    expect(result).toContain("<b>Alice</b>");
    expect(result).toContain("<b>age:</b> 30");
    expect(result).toContain("<b>city:</b> NYC");
  });

  it("tooltip formatter returns plain label when no properties", () => {
    render(<GraphChart nodes={sampleNodes} edges={sampleEdges} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const formatter = optionsCall.tooltip.formatter;
    const result = formatter({
      dataType: "node",
      name: "Alice",
      data: { nodeLabel: "Alice" },
    });
    expect(result).toBe("Alice");
  });
});
