import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GaugeChart } from "../gauge-chart";

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

const sampleData = [{ value: 75, name: "Score" }];

describe("GaugeChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  // --- axisTick distance bug fix ---
  it("sets axisTick.distance to -15 in non-compact mode (bug fix: was -compact ? 0 : 15)", () => {
    // In non-compact mode (container >= 200px), axisTick.distance must be -15 (inward).
    // The old code used `-compact ? 0 : 15` which always evaluated to 15 due to unary minus on boolean.
    render(<GaugeChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const series = optionsCall.series[0];
    // Non-compact: axisTick is shown and distance should be -15 (negative = inward from arc)
    expect(series.axisTick.show).toBe(true);
    expect(series.axisTick.distance).toBe(-15);
  });

  // --- splitLine distance fix ---
  it("sets splitLine.distance to -25 in non-compact mode to push lines further inward", () => {
    render(<GaugeChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const series = optionsCall.series[0];
    expect(series.splitLine.show).toBe(true);
    expect(series.splitLine.distance).toBe(-25);
  });

  // --- axisLabel distance fix ---
  it("sets axisLabel.distance to 35 in non-compact mode for more space between labels and arc", () => {
    render(<GaugeChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const series = optionsCall.series[0];
    expect(series.axisLabel.show).toBe(true);
    expect(series.axisLabel.distance).toBe(35);
  });

  // --- axisLabel fontSize ---
  it("sets axisLabel.fontSize to 12 to reduce label size", () => {
    render(<GaugeChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].axisLabel.fontSize).toBe(12);
  });

  // --- axisTick splitNumber ---
  it("sets axisTick.splitNumber to 2 to reduce number of minor ticks", () => {
    render(<GaugeChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].axisTick.splitNumber).toBe(2);
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
    const stylingRules = [{ id: "r1", operator: ">" as const, value: 50, color: "#ff0000" }];
    render(<GaugeChart data={[{ value: 75, name: "Score" }]} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const gaugeData = optionsCall.series[0].data[0];
    expect(gaugeData.itemStyle?.color).toBe("#ff0000");
  });

  it("does not apply color when value does not match any styling rule", () => {
    const stylingRules = [{ id: "r1", operator: ">" as const, value: 90, color: "#ff0000" }];
    render(<GaugeChart data={[{ value: 75, name: "Score" }]} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const gaugeData = optionsCall.series[0].data[0];
    expect(gaugeData.itemStyle).toBeUndefined();
  });

  it("accepts paramValues prop without error", () => {
    const stylingRules = [{ id: "r1", operator: ">=" as const, value: 50, color: "#00ff00" }];
    const paramValues = { threshold: 50 };
    render(<GaugeChart data={sampleData} stylingRules={stylingRules} paramValues={paramValues} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });
});
