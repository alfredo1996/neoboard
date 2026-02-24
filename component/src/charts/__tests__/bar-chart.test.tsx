import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BarChart } from "../bar-chart";

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
  { label: "Product A", value: 100 },
  { label: "Product B", value: 200 },
  { label: "Product C", value: 150 },
];

const stackedData = [
  { label: "Q1", sales: 100, returns: 20 },
  { label: "Q2", sales: 200, returns: 30 },
  { label: "Q3", sales: 150, returns: 10 },
];

describe("BarChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders without errors", () => {
    render(<BarChart data={sampleData} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<BarChart data={sampleData} className="my-bar" />);
    expect(screen.getByTestId("base-chart")).toHaveClass("my-bar");
  });

  it("builds bar series from data", () => {
    render(<BarChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series).toHaveLength(1);
    expect(optionsCall.series[0].type).toBe("bar");
    expect(optionsCall.series[0].data).toEqual([100, 200, 150]);
  });

  it("supports horizontal orientation", () => {
    render(<BarChart data={sampleData} orientation="horizontal" />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.xAxis.type).toBe("value");
    expect(optionsCall.yAxis.type).toBe("category");
  });

  it("supports stacked bars", () => {
    render(<BarChart data={stackedData} stacked />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].stack).toBe("total");
    expect(optionsCall.series[1].stack).toBe("total");
  });

  it("shows values on bars", () => {
    render(<BarChart data={sampleData} showValues />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].label.show).toBe(true);
  });

  it("shows legend for multiple series", () => {
    render(<BarChart data={stackedData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.legend).toBeDefined();
  });

  it("handles empty data", () => {
    render(<BarChart data={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.title.text).toBe("No data");
  });

  it("shows loading state", () => {
    render(<BarChart data={sampleData} loading />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<BarChart data={sampleData} error={new Error("Fail")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Fail");
  });

  // --- New options ---

  it("sets barWidth on series when provided and > 0", () => {
    render(<BarChart data={sampleData} barWidth={20} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].barWidth).toBe(20);
  });

  it("sets barWidth to undefined when barWidth is 0 (auto)", () => {
    render(<BarChart data={sampleData} barWidth={0} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].barWidth).toBeUndefined();
  });

  it("passes barGap to series", () => {
    render(<BarChart data={sampleData} barGap="10%" />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].barGap).toBe("10%");
  });

  it("shows grid lines by default", () => {
    render(<BarChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.yAxis.splitLine.show).toBe(true);
  });

  it("hides grid lines when showGridLines is false", () => {
    render(<BarChart data={sampleData} showGridLines={false} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.yAxis.splitLine.show).toBe(false);
  });

  it("sets xAxisLabel on the category axis for vertical orientation", () => {
    render(<BarChart data={sampleData} xAxisLabel="Product" />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.xAxis.name).toBe("Product");
  });

  it("sets yAxisLabel on the value axis for vertical orientation", () => {
    render(<BarChart data={sampleData} yAxisLabel="Revenue" />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.yAxis.name).toBe("Revenue");
  });

  it("swaps axis label targets for horizontal orientation", () => {
    render(<BarChart data={sampleData} orientation="horizontal" xAxisLabel="Revenue" yAxisLabel="Product" />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    // xAxisLabel goes to the value axis (xAxis in horizontal), yAxisLabel to category (yAxis)
    expect(optionsCall.xAxis.name).toBe("Revenue");
    expect(optionsCall.yAxis.name).toBe("Product");
  });
});
