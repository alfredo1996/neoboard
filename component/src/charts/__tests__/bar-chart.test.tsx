import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BarChartProps } from "../bar-chart";
import { BarChart } from "../bar-chart";

// echarts/charts, echarts/components, echarts/renderers are mocked globally
// in vitest.setup.ts. Only echarts/core is mocked here to capture setOption.
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
  const registerTheme = vi.fn();
  return { use, init, registerTheme, default: { use, init, registerTheme } };
});

/** Render BarChart and return the ECharts options passed to setOption. */
function renderBarOptions(props: BarChartProps) {
  render(<BarChart {...props} />);
  return mockSetOption.mock.calls[0][0];
}

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

  it("renders without errors", () => {
    render(<BarChart data={sampleData} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<BarChart data={sampleData} className="my-bar" />);
    expect(screen.getByTestId("base-chart")).toHaveClass("my-bar");
  });

  it("builds bar series from data", () => {
    const opts = renderBarOptions({ data: sampleData });
    expect(opts.series).toHaveLength(1);
    expect(opts.series[0].type).toBe("bar");
    expect(opts.series[0].data).toEqual([100, 200, 150]);
  });

  it("supports horizontal orientation", () => {
    const opts = renderBarOptions({
      data: sampleData,
      orientation: "horizontal",
    });
    expect(opts.xAxis.type).toBe("value");
    expect(opts.yAxis.type).toBe("category");
  });

  it("supports stacked bars", () => {
    const opts = renderBarOptions({ data: stackedData, stacked: true });
    expect(opts.series[0].stack).toBe("total");
    expect(opts.series[1].stack).toBe("total");
  });

  it("shows values on bars", () => {
    const opts = renderBarOptions({ data: sampleData, showValues: true });
    expect(opts.series[0].label.show).toBe(true);
  });

  it("shows legend for multiple series", () => {
    const opts = renderBarOptions({ data: stackedData });
    expect(opts.legend).toBeDefined();
  });

  it("renders a DOM/AT-readable empty state for empty data (#1053)", () => {
    render(<BarChart data={[]} />);
    // The empty state is a real DOM element (role=status), not just an
    // ECharts canvas title, so screen readers announce it.
    const empty = screen.getByTestId("bar-chart-empty");
    expect(empty).toHaveTextContent("No data");
    expect(empty).toHaveAttribute("role", "status");
    // No chart was rendered for empty data.
    expect(mockSetOption).not.toHaveBeenCalled();
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
    const opts = renderBarOptions({ data: sampleData, barWidth: 20 });
    expect(opts.series[0].barWidth).toBe(20);
  });

  it("sets barWidth to undefined when barWidth is 0 (auto)", () => {
    const opts = renderBarOptions({ data: sampleData, barWidth: 0 });
    expect(opts.series[0].barWidth).toBeUndefined();
  });

  it("passes barGap to series", () => {
    const opts = renderBarOptions({ data: sampleData, barGap: "10%" });
    expect(opts.series[0].barGap).toBe("10%");
  });

  it("shows grid lines by default", () => {
    const opts = renderBarOptions({ data: sampleData });
    expect(opts.yAxis.splitLine.show).toBe(true);
  });

  it("hides grid lines when showGridLines is false", () => {
    const opts = renderBarOptions({ data: sampleData, showGridLines: false });
    expect(opts.yAxis.splitLine.show).toBe(false);
  });

  it("sets xAxisLabel on the category axis for vertical orientation", () => {
    const opts = renderBarOptions({ data: sampleData, xAxisLabel: "Product" });
    expect(opts.xAxis.name).toBe("Product");
  });

  it("sets yAxisLabel on the value axis for vertical orientation", () => {
    const opts = renderBarOptions({ data: sampleData, yAxisLabel: "Revenue" });
    expect(opts.yAxis.name).toBe("Revenue");
  });

  it("swaps axis label targets for horizontal orientation", () => {
    const opts = renderBarOptions({
      data: sampleData,
      orientation: "horizontal",
      xAxisLabel: "Revenue",
      yAxisLabel: "Product",
    });
    // xAxisLabel goes to the value axis (xAxis in horizontal), yAxisLabel to category (yAxis)
    expect(opts.xAxis.name).toBe("Revenue");
    expect(opts.yAxis.name).toBe("Product");
  });

  // --- Reference lines (markLine) ---

  it("attaches markLine to the first series when referenceLines is provided", () => {
    const refs = JSON.stringify([
      { value: 150, label: "Target", color: "#ff0000" },
    ]);
    const opts = renderBarOptions({ data: sampleData, referenceLines: refs });
    expect(opts.series[0].markLine).toBeDefined();
    expect(opts.series[0].markLine.data).toHaveLength(1);
    expect(opts.series[0].markLine.data[0].yAxis).toBe(150);
  });

  // #1548: the value axis is X when the chart is horizontal, so the markLine
  // has to follow the swap. Anchored to yAxis it lands on the category axis,
  // where ECharts silently drops it.
  it("anchors the reference line to the value axis for horizontal bars", () => {
    const refs = JSON.stringify([{ value: 150, label: "Target" }]);
    const opts = renderBarOptions({
      data: sampleData,
      orientation: "horizontal",
      referenceLines: refs,
    });
    const entry = opts.series[0].markLine.data[0];
    expect(entry.xAxis).toBe(150);
    expect(entry.yAxis).toBeUndefined();
  });

  it("does not attach markLine when referenceLines is not provided", () => {
    const opts = renderBarOptions({ data: sampleData });
    expect(opts.series[0].markLine).toBeUndefined();
  });

  // --- DataZoom ---

  it("passes enableDataZoom to BaseChart", () => {
    const opts = renderBarOptions({ data: sampleData, enableDataZoom: true });
    expect(opts.dataZoom).toBeDefined();
    expect(opts.dataZoom.length).toBeGreaterThan(0);
  });

  // --- Percentage stacked ---

  it("normalizes values to percentages when stackMode is percent", () => {
    const opts = renderBarOptions({
      data: stackedData,
      stackMode: "percent",
    });
    // Q1: sales=100, returns=20 -> total=120 -> sales=83.33%, returns=16.67%
    expect(opts.series[0].data[0]).toBeCloseTo(83.33, 1);
    expect(opts.series[1].data[0]).toBeCloseTo(16.67, 1);
  });

  it("sets y-axis max to 100 in percent mode", () => {
    const opts = renderBarOptions({
      data: stackedData,
      stackMode: "percent",
    });
    expect(opts.yAxis.max).toBe(100);
  });

  it("stacks series in percent mode", () => {
    const opts = renderBarOptions({
      data: stackedData,
      stackMode: "percent",
    });
    expect(opts.series[0].stack).toBe("total");
    expect(opts.series[1].stack).toBe("total");
  });

  it("stacks series in stacked mode (backward compat)", () => {
    const opts = renderBarOptions({
      data: stackedData,
      stackMode: "stacked",
    });
    expect(opts.series[0].stack).toBe("total");
  });

  it("does not stack in none mode", () => {
    const opts = renderBarOptions({ data: stackedData, stackMode: "none" });
    expect(opts.series[0].stack).toBeUndefined();
  });

  it("backward compat: stacked boolean still works", () => {
    const opts = renderBarOptions({ data: stackedData, stacked: true });
    expect(opts.series[0].stack).toBe("total");
  });

  it("handles zero total gracefully in percent mode", () => {
    const zeroData = [
      { label: "A", x: 0, y: 0 },
      { label: "B", x: 10, y: 20 },
    ];
    const opts = renderBarOptions({ data: zeroData, stackMode: "percent" });
    // Zero total row: all values should be 0 (not NaN)
    expect(opts.series[0].data[0]).toBe(0);
    expect(opts.series[1].data[0]).toBe(0);
  });

  it("auto-derives a descriptive aria-label from data shape (single series)", () => {
    // Default "Chart visualization" is unhelpful for screen-reader users.
    // The container should reflect the actual data — categories × series.
    render(<BarChart data={sampleData} />);
    expect(
      screen.getByLabelText(/bar chart with 3 categories and 1 series/i),
    ).toBeInTheDocument();
  });

  it("auto-derived aria-label lists series names for multi-series", () => {
    render(<BarChart data={stackedData} />);
    const el = screen.getByTestId("base-chart");
    const label = el.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/bar chart with 3 categories and 2 series/i);
    expect(label).toContain("sales");
    expect(label).toContain("returns");
  });

  it("explicit ariaDescription prop overrides the auto-derived label", () => {
    render(
      <BarChart
        data={sampleData}
        ariaDescription="Quarterly product revenue"
      />,
    );
    expect(
      screen.getByLabelText("Quarterly product revenue"),
    ).toBeInTheDocument();
  });

  it("renders the accessible empty state (not a chart) for empty data without crashing", () => {
    render(<BarChart data={[]} />);
    // Empty data now renders an AT-readable status element instead of a chart.
    expect(screen.queryByTestId("base-chart")).not.toBeInTheDocument();
    expect(screen.getByTestId("bar-chart-empty")).toHaveAttribute(
      "role",
      "status",
    );
  });
});
