import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LineChart } from "../line-chart";
import { fadeToTransparent } from "../chart-utils";

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

  it("defaults to smooth, fine 1.5px lines with a subtle area fill (#822)", () => {
    render(<LineChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].smooth).toBe(true);
    expect(optionsCall.series[0].lineStyle.width).toBe(1.5);
    expect(optionsCall.series[0].areaStyle).toBeDefined();
    expect(optionsCall.series[0].areaStyle.opacity).toBeLessThanOrEqual(0.15);
  });

  it("can disable smoothing and area fill explicitly", () => {
    render(<LineChart data={sampleData} smooth={false} area={false} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].smooth).toBe(false);
    expect(optionsCall.series[0].areaStyle).toBeUndefined();
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

  describe("area fill is theme-aware (#1244)", () => {
    // seriesColor comes from a matched styling rule, not the colors prop —
    // that is what activates the gradient branch of areaStyle.
    const amberRule = [
      { id: "r1", operator: ">=" as const, value: 0, color: "#f9a91f" },
    ];

    afterEach(() => document.documentElement.classList.remove("dark"));

    it("uses a fainter fill in dark mode", () => {
      // A warm fill over charcoal composites to brown, so dark needs to be
      // fainter to read as a tint rather than a stain.
      render(<LineChart data={sampleData} area stylingRules={amberRule} />);
      const light = mockSetOption.mock.calls[0][0].series[0].areaStyle.opacity;

      mockSetOption.mockClear();
      document.documentElement.classList.add("dark");
      render(<LineChart data={sampleData} area stylingRules={amberRule} />);
      const dark = mockSetOption.mock.calls[0][0].series[0].areaStyle.opacity;

      // Exact values, not just dark < light — a change that scaled both
      // proportionally would keep the ordering while losing the tuning.
      expect(light).toBe(0.15);
      expect(dark).toBe(0.06);
    });

    it("fades the gradient to the same hue, never to transparent white", () => {
      // Canvas interpolates gradients in non-premultiplied RGBA, so fading to
      // rgba(255,255,255,0) washes a saturated colour through pale grey.
      render(<LineChart data={sampleData} area stylingRules={amberRule} />);
      const stops =
        mockSetOption.mock.calls[0][0].series[0].areaStyle.color.colorStops;
      const last = stops[stops.length - 1].color;
      expect(last).not.toMatch(/255,\s*255,\s*255/);
      // Assert the exact fadeToTransparent output, not just the hue: an
      // OPAQUE same-hue colour ("#f9a91f") would satisfy a hue-only check
      // while completely defeating the fade this test exists to protect.
      expect(last).toBe(fadeToTransparent("#f9a91f"));
      expect(last).toMatch(/00$/);
    });

    it("still dims the flat fallback fill when no series colour is resolved", () => {
      render(<LineChart data={sampleData} area />);
      const light = mockSetOption.mock.calls[0][0].series[0].areaStyle.opacity;

      mockSetOption.mockClear();
      document.documentElement.classList.add("dark");
      render(<LineChart data={sampleData} area />);
      const dark = mockSetOption.mock.calls[0][0].series[0].areaStyle.opacity;

      expect(light).toBe(0.12);
      expect(dark).toBe(0.08);
    });
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

  it("defaults line width to 1.5 (#822)", () => {
    render(<LineChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].lineStyle.width).toBe(1.5);
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

  // --- Connect nulls ---

  it("defaults connectNulls to false", () => {
    render(<LineChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].connectNulls).toBe(false);
  });

  it("enables connectNulls when true", () => {
    render(<LineChart data={sampleData} connectNulls />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].connectNulls).toBe(true);
  });

  it("applies connectNulls to every series in multi-series", () => {
    render(<LineChart data={multiSeriesData} connectNulls />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].connectNulls).toBe(true);
    expect(optionsCall.series[1].connectNulls).toBe(true);
  });

  // --- End label ---

  it("does not set endLabel by default", () => {
    render(<LineChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].endLabel).toBeUndefined();
  });

  it("enables endLabel when true", () => {
    render(<LineChart data={sampleData} endLabel />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].endLabel).toEqual({
      show: true,
      formatter: "{a}",
    });
  });

  it("applies endLabel to every series in multi-series", () => {
    render(<LineChart data={multiSeriesData} endLabel />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].endLabel).toEqual({
      show: true,
      formatter: "{a}",
    });
    expect(optionsCall.series[1].endLabel).toEqual({
      show: true,
      formatter: "{a}",
    });
  });

  // --- Reference lines ---

  it("attaches markLine to the first series when referenceLines is provided", () => {
    const refs = JSON.stringify([
      { value: 50, label: "Target", color: "#ff0000" },
    ]);
    render(<LineChart data={sampleData} referenceLines={refs} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].markLine).toBeDefined();
    expect(optionsCall.series[0].markLine.data).toHaveLength(1);
    expect(optionsCall.series[0].markLine.data[0].yAxis).toBe(50);
    expect(optionsCall.series[0].markLine.data[0].label.formatter).toBe(
      "Target",
    );
    expect(optionsCall.series[0].markLine.data[0].lineStyle.color).toBe(
      "#ff0000",
    );
  });

  it("does not attach markLine when referenceLines is not provided", () => {
    render(<LineChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].markLine).toBeUndefined();
  });

  it("only attaches markLine to the first series in multi-series", () => {
    const refs = JSON.stringify([{ value: 100 }]);
    render(<LineChart data={multiSeriesData} referenceLines={refs} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].markLine).toBeDefined();
    expect(optionsCall.series[1].markLine).toBeUndefined();
  });

  // --- DataZoom ---

  it("passes enableDataZoom to BaseChart", () => {
    render(<LineChart data={sampleData} enableDataZoom />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.dataZoom).toBeDefined();
    expect(optionsCall.dataZoom.length).toBeGreaterThan(0);
  });

  // --- Sampling ---

  it("enables sampling when data exceeds threshold", () => {
    const largeData = Array.from({ length: 10 }, (_, i) => ({
      x: i,
      y: i * 10,
    }));
    render(
      <LineChart
        data={largeData}
        samplingThreshold={5}
        samplingMethod="lttb"
      />,
    );
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].sampling).toBe("lttb");
  });

  it("does not enable sampling when data is below threshold", () => {
    render(<LineChart data={sampleData} samplingThreshold={1000} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].sampling).toBeUndefined();
  });

  it("does not enable sampling when threshold is 0", () => {
    const largeData = Array.from({ length: 2000 }, (_, i) => ({ x: i, y: i }));
    render(<LineChart data={largeData} samplingThreshold={0} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].sampling).toBeUndefined();
  });

  // --- Time axis ---

  it("auto-detects ISO date strings and uses time axis", () => {
    const timeData = [
      { x: "2024-01-15", y: 100 },
      { x: "2024-02-15", y: 200 },
      { x: "2024-03-15", y: 150 },
    ];
    render(<LineChart data={timeData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.xAxis.type).toBe("time");
    expect(optionsCall.series[0].data[0]).toEqual(["2024-01-15", 100]);
  });

  it("uses category axis for non-date strings", () => {
    render(<LineChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.xAxis.type).toBe("category");
  });

  it("uses category axis for year numbers (1900-2100)", () => {
    const yearData = [
      { x: 1990, y: 5 },
      { x: 2000, y: 10 },
      { x: 2010, y: 15 },
    ];
    render(<LineChart data={yearData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.xAxis.type).toBe("category");
  });

  // --- Dual Y-axis ---

  it("renders a single y-axis object when rightAxisSeries is empty or undefined", () => {
    render(<LineChart data={multiSeriesData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(Array.isArray(optionsCall.yAxis)).toBe(false);
    expect(optionsCall.yAxis.type).toBe("value");
  });

  it("renders two y-axes when rightAxisSeries is non-empty", () => {
    render(<LineChart data={multiSeriesData} rightAxisSeries={["cost"]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(Array.isArray(optionsCall.yAxis)).toBe(true);
    expect(optionsCall.yAxis).toHaveLength(2);
    expect(optionsCall.yAxis[0].type).toBe("value");
    expect(optionsCall.yAxis[1].type).toBe("value");
  });

  it("assigns yAxisIndex 0 to left series and 1 to right series", () => {
    render(<LineChart data={multiSeriesData} rightAxisSeries={["cost"]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].name).toBe("revenue");
    expect(optionsCall.series[0].yAxisIndex).toBe(0);
    expect(optionsCall.series[1].name).toBe("cost");
    expect(optionsCall.series[1].yAxisIndex).toBe(1);
  });

  it("supports multiple series on the right axis", () => {
    const data = [
      { x: "Jan", a: 1, b: 2, c: 3 },
      { x: "Feb", a: 4, b: 5, c: 6 },
    ];
    render(<LineChart data={data} rightAxisSeries={["b", "c"]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].yAxisIndex).toBe(0);
    expect(optionsCall.series[1].yAxisIndex).toBe(1);
    expect(optionsCall.series[2].yAxisIndex).toBe(1);
  });

  it("applies yAxisLabel to left axis and rightYAxisLabel to right axis", () => {
    render(
      <LineChart
        data={multiSeriesData}
        rightAxisSeries={["cost"]}
        yAxisLabel="Revenue ($)"
        rightYAxisLabel="Cost (%)"
      />,
    );
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.yAxis[0].name).toBe("Revenue ($)");
    expect(optionsCall.yAxis[1].name).toBe("Cost (%)");
  });

  it("ignores unknown series names in rightAxisSeries (treats as left)", () => {
    render(
      <LineChart data={multiSeriesData} rightAxisSeries={["nonexistent"]} />,
    );
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].yAxisIndex).toBe(0);
    expect(optionsCall.series[1].yAxisIndex).toBe(0);
    expect(Array.isArray(optionsCall.yAxis)).toBe(true);
  });

  // --- Accessibility: auto-derived aria description ---

  it("auto-derives a descriptive aria-label from data shape (single series)", () => {
    // Default "Chart visualization" is unhelpful for screen-reader users.
    // The container should reflect the actual data — points × series.
    render(<LineChart data={sampleData} />);
    expect(
      screen.getByLabelText(/line chart with 3 points and 1 series/i),
    ).toBeInTheDocument();
  });

  it("auto-derived aria-label lists series names for multi-series", () => {
    render(<LineChart data={multiSeriesData} />);
    const el = screen.getByTestId("base-chart");
    const label = el.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/line chart with 3 points and 2 series/i);
    expect(label).toContain("revenue");
    expect(label).toContain("cost");
  });

  it("explicit ariaDescription prop overrides the auto-derived label", () => {
    render(
      <LineChart data={sampleData} ariaDescription="Monthly revenue trend" />,
    );
    expect(screen.getByLabelText("Monthly revenue trend")).toBeInTheDocument();
  });

  it("auto-derived aria-label handles empty data without crashing", () => {
    render(<LineChart data={[]} />);
    const el = screen.getByTestId("base-chart");
    expect(el.getAttribute("aria-label")).toMatch(/line chart/i);
  });
});
