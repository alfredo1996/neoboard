import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GaugeChart } from "../gauge-chart";

// echarts/charts, echarts/components, echarts/renderers are mocked globally
// in vitest.setup.ts. Only echarts/core is mocked here to capture setOption.
const mockSetOption = vi.fn();

// Mock useContainerSize so we can control measured vs unmeasured state.
// Default: simulates a measured non-compact container (400x300).
const mockSize = { width: 400, height: 300 };
vi.mock("@/hooks/useContainerSize", () => ({
  useContainerSize: () => ({
    width: mockSize.width,
    height: mockSize.height,
    containerRef: vi.fn(),
  }),
}));

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

const sampleData = [{ value: 75, name: "Score" }];

describe("GaugeChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to measured non-compact container
    mockSize.width = 400;
    mockSize.height = 300;
  });

  it("renders without errors", () => {
    render(<GaugeChart data={sampleData} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("handles empty data with a No data title", () => {
    render(<GaugeChart data={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.title.text).toBe("No data");
  });

  it("sets gauge type on series", () => {
    render(<GaugeChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].type).toBe("gauge");
  });

  it("passes min and max to the series", () => {
    render(<GaugeChart data={sampleData} min={10} max={200} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].min).toBe(10);
    expect(optionsCall.series[0].max).toBe(200);
  });

  // --- minimal design: no ticks, no labels ---
  it("hides axisTick in minimal design", () => {
    render(<GaugeChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].axisTick.show).toBe(false);
  });

  it("hides splitLine in minimal design", () => {
    render(<GaugeChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].splitLine.show).toBe(false);
  });

  it("hides axisLabel in minimal design", () => {
    render(<GaugeChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].axisLabel.show).toBe(false);
  });

  it("shows progress arc with roundCap by default", () => {
    render(<GaugeChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const series = optionsCall.series[0];
    expect(series.progress.show).toBe(true);
    expect(series.progress.roundCap).toBe(true);
  });

  it("hides pointer and anchor", () => {
    render(<GaugeChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const series = optionsCall.series[0];
    expect(series.pointer.show).toBe(false);
    expect(series.anchor.show).toBe(false);
  });

  it("uses roundCap on axisLine track", () => {
    render(<GaugeChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].axisLine.roundCap).toBe(true);
  });

  it("shows loading state", () => {
    render(<GaugeChart data={sampleData} loading />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<GaugeChart data={sampleData} error={new Error("Fail")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Fail");
  });

  // --- styling rules ---

  it("applies styling rule color to gauge item when value matches rule", () => {
    const stylingRules = [
      { id: "r1", operator: ">" as const, value: 50, color: "#ff0000" },
    ];
    render(
      <GaugeChart
        data={[{ value: 75, name: "Score" }]}
        stylingRules={stylingRules}
      />,
    );
    const optionsCall = mockSetOption.mock.calls[0][0];
    const gaugeData = optionsCall.series[0].data[0];
    expect(gaugeData.itemStyle?.color).toBe("#ff0000");
  });

  it("does not apply color when value does not match any styling rule", () => {
    const stylingRules = [
      { id: "r1", operator: ">" as const, value: 90, color: "#ff0000" },
    ];
    render(
      <GaugeChart
        data={[{ value: 75, name: "Score" }]}
        stylingRules={stylingRules}
      />,
    );
    const optionsCall = mockSetOption.mock.calls[0][0];
    const gaugeData = optionsCall.series[0].data[0];
    expect(gaugeData.itemStyle).toBeUndefined();
  });

  it("accepts paramValues prop without error", () => {
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 50, color: "#00ff00" },
    ];
    const paramValues = { threshold: 50 };
    render(
      <GaugeChart
        data={sampleData}
        stylingRules={stylingRules}
        paramValues={paramValues}
      />,
    );
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  // --- tick flash bug fix ---
  // When the container size is not yet known (width === 0, e.g. during page navigation
  // or initial mount), the chart must not render with ticks/splitLines/axisLabels visible.
  // Otherwise users see a brief flash of tick marks before the correct compact state is applied.

  it("does not pass options to BaseChart when container size is unknown (prevents tick flash)", () => {
    // Simulate unmeasured container
    mockSize.width = 0;
    mockSize.height = 0;
    render(<GaugeChart data={sampleData} />);
    // setOption should NOT be called when container is unmeasured
    expect(mockSetOption).not.toHaveBeenCalled();
  });

  // --- compact mode ---

  it("uses smaller arc width and font in compact mode (container < 200px)", () => {
    mockSize.width = 150;
    mockSize.height = 150;
    render(<GaugeChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const series = optionsCall.series[0];
    // Thinner arc in compact
    expect(series.axisLine.lineStyle.width).toBe(10);
    expect(series.progress.width).toBe(10);
    // Smaller detail font, title hidden
    expect(series.detail.show).toBe(true);
    expect(series.detail.fontSize).toBe(18);
    expect(series.title.show).toBe(false);
  });
});
