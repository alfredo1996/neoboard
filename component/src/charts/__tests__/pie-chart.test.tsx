import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PieChart } from "../pie-chart";

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
  { name: "Desktop", value: 60 },
  { name: "Mobile", value: 30 },
  { name: "Tablet", value: 10 },
];

describe("PieChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders without errors", () => {
    render(<PieChart data={sampleData} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<PieChart data={sampleData} className="my-pie" />);
    expect(screen.getByTestId("base-chart")).toHaveClass("my-pie");
  });

  it("builds pie series from data", () => {
    render(<PieChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series).toHaveLength(1);
    expect(optionsCall.series[0].type).toBe("pie");
    expect(optionsCall.series[0].data).toEqual(sampleData);
  });

  it("supports donut style", () => {
    render(<PieChart data={sampleData} donut />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].radius).toEqual(["40%", "70%"]);
  });

  it("hides labels when showLabel is false", () => {
    render(<PieChart data={sampleData} showLabel={false} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].label.show).toBe(false);
  });

  it("hides legend when showLegend is false", () => {
    render(<PieChart data={sampleData} showLegend={false} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.legend).toBeUndefined();
  });

  it("handles empty data", () => {
    render(<PieChart data={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.title.text).toBe("No data");
  });

  it("shows error state", () => {
    render(<PieChart data={sampleData} error={new Error("Broken")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Broken");
  });
});
