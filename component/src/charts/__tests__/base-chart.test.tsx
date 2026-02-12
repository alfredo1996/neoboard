import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BaseChart } from "../base-chart";

const mockSetOption = vi.fn();
const mockResize = vi.fn();
const mockDispose = vi.fn();
const mockOn = vi.fn();
const mockOff = vi.fn();
const mockShowLoading = vi.fn();
const mockHideLoading = vi.fn();

vi.mock("echarts/core", () => {
  const use = vi.fn();
  const init = vi.fn(() => ({
    setOption: mockSetOption,
    resize: mockResize,
    dispose: mockDispose,
    on: mockOn,
    off: mockOff,
    showLoading: mockShowLoading,
    hideLoading: mockHideLoading,
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

describe("BaseChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a chart container", () => {
    render(<BaseChart options={{}} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<BaseChart options={{}} className="my-chart" />);
    expect(screen.getByTestId("base-chart")).toHaveClass("my-chart");
  });

  it("calls onChartReady when initialized", () => {
    const onReady = vi.fn();
    render(<BaseChart options={{}} onChartReady={onReady} />);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("sets ECharts options", () => {
    const options = { title: { text: "Test" } };
    render(<BaseChart options={options} />);
    expect(mockSetOption).toHaveBeenCalledWith(
      expect.objectContaining({ title: { text: "Test" } }),
      { notMerge: true },
    );
  });

  it("disposes chart on unmount", () => {
    const { unmount } = render(<BaseChart options={{}} />);
    unmount();
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });

  it("shows loading state", () => {
    render(<BaseChart options={{}} loading />);
    expect(mockShowLoading).toHaveBeenCalled();
  });

  it("hides loading when loading prop is false", () => {
    render(<BaseChart options={{}} loading={false} />);
    expect(mockHideLoading).toHaveBeenCalled();
  });

  it("renders error state instead of chart", () => {
    render(<BaseChart options={{}} error={new Error("Failed to load")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load");
    expect(screen.queryByTestId("base-chart")).not.toBeInTheDocument();
  });

  it("registers click handler", () => {
    const onClick = vi.fn();
    render(<BaseChart options={{}} onClick={onClick} />);
    expect(mockOn).toHaveBeenCalledWith("click", expect.any(Function));
  });

  it("registers dataZoom handler", () => {
    const onDataZoom = vi.fn();
    render(<BaseChart options={{}} onDataZoom={onDataZoom} />);
    expect(mockOn).toHaveBeenCalledWith("dataZoom", onDataZoom);
  });

  it("cleans up event handlers on unmount", () => {
    const onClick = vi.fn();
    const { unmount } = render(<BaseChart options={{}} onClick={onClick} />);
    unmount();
    expect(mockOff).toHaveBeenCalledWith("click");
    expect(mockOff).toHaveBeenCalledWith("dataZoom");
  });

  it("includes chart colors in default options", () => {
    render(<BaseChart options={{ title: { text: "Test" } }} />);
    expect(mockSetOption).toHaveBeenCalledWith(
      expect.objectContaining({
        color: expect.arrayContaining(["hsl(12, 76%, 61%)"]),
      }),
      { notMerge: true },
    );
  });
});
