import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LineChart } from "../line-chart";

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

const sampleData = [
  { x: "Jan", y: 100 },
  { x: "Feb", y: 200 },
  { x: "Mar", y: 150 },
];

const multiSeriesData = [
  { x: "Jan", revenue: 100, cost: 80 },
  { x: "Feb", revenue: 200, cost: 120 },
  { x: "Mar", revenue: 150, cost: 90 },
];

describe("LineChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders without errors", () => {
    render(<LineChart data={sampleData} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<LineChart data={sampleData} className="my-line" />);
    expect(screen.getByTestId("base-chart")).toHaveClass("my-line");
  });

  it("builds line series from data", () => {
    render(<LineChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series).toHaveLength(1);
    expect(optionsCall.series[0].type).toBe("line");
    expect(optionsCall.series[0].data).toEqual([100, 200, 150]);
  });

  it("supports multiple series", () => {
    render(<LineChart data={multiSeriesData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series).toHaveLength(2);
    expect(optionsCall.series[0].name).toBe("revenue");
    expect(optionsCall.series[1].name).toBe("cost");
  });

  it("enables smooth mode", () => {
    render(<LineChart data={sampleData} smooth />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].smooth).toBe(true);
  });

  it("enables area fill", () => {
    render(<LineChart data={sampleData} area />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].areaStyle).toBeDefined();
  });

  it("sets x-axis label", () => {
    render(<LineChart data={sampleData} xAxisLabel="Month" />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.xAxis.name).toBe("Month");
  });

  it("sets y-axis label", () => {
    render(<LineChart data={sampleData} yAxisLabel="Sales" />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.yAxis.name).toBe("Sales");
  });

  it("shows legend for multiple series", () => {
    render(<LineChart data={multiSeriesData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.legend).toBeDefined();
  });

  it("handles empty data", () => {
    render(<LineChart data={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.title.text).toBe("No data");
  });

  it("shows loading state", () => {
    render(<LineChart data={sampleData} loading />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<LineChart data={sampleData} error={new Error("Oops")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Oops");
  });

  // --- New options ---

  it("shows data point markers when showPoints is true", () => {
    render(<LineChart data={sampleData} showPoints />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].showSymbol).toBe(true);
  });

  it("hides data point markers by default", () => {
    render(<LineChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].showSymbol).toBe(false);
  });

  it("sets line width on series", () => {
    render(<LineChart data={sampleData} lineWidth={4} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].lineStyle.width).toBe(4);
  });

  it("defaults line width to 2", () => {
    render(<LineChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].lineStyle.width).toBe(2);
  });

  it("shows grid lines by default", () => {
    render(<LineChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.yAxis.splitLine.show).toBe(true);
  });

  it("hides grid lines when showGridLines is false", () => {
    render(<LineChart data={sampleData} showGridLines={false} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.yAxis.splitLine.show).toBe(false);
  });

  it("enables stepped line style", () => {
    render(<LineChart data={sampleData} stepped />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].step).toBe("start");
  });

  it("does not set step property when stepped is false", () => {
    render(<LineChart data={sampleData} stepped={false} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].step).toBeUndefined();
  });
});
