import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GraphChart } from "../graph-chart";

const mockSetOption = vi.fn();

vi.mock("echarts/core", () => {
  const use = vi.fn();
  const init = vi.fn(() => ({
    setOption: mockSetOption,
    resize: vi.fn(),
    dispose: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
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
});
