import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RadarChart } from "../radar-chart";

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

const sampleData = {
  indicators: [
    { name: "Speed", max: 100 },
    { name: "Strength", max: 100 },
    { name: "Agility", max: 100 },
  ],
  series: [
    { name: "Player A", values: [80, 60, 90] },
    { name: "Player B", values: [70, 85, 50] },
  ],
};

describe("RadarChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without errors", () => {
    render(<RadarChart data={sampleData} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("handles empty indicators/series with a No data title", () => {
    render(<RadarChart data={{ indicators: [], series: [] }} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.title.text).toBe("No data");
  });

  it("sets radar type on series", () => {
    render(<RadarChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].type).toBe("radar");
  });

  it("passes indicator configuration to radar chart", () => {
    render(<RadarChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.radar.indicator).toEqual(sampleData.indicators);
  });

  it("renders one data entry per series", () => {
    render(<RadarChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].data).toHaveLength(2);
  });

  it("shows loading state", () => {
    render(<RadarChart data={sampleData} loading />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<RadarChart data={sampleData} error={new Error("Fail")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Fail");
  });

  // --- styling rules ---

  it("applies styling rule color to series with high average value", () => {
    const singleSeriesData = {
      indicators: [{ name: "Speed", max: 100 }],
      series: [{ name: "Fast", values: [90] }],
    };
    const stylingRules = [{ id: "r1", operator: ">=" as const, value: 80, color: "#ff0000" }];
    render(<RadarChart data={singleSeriesData} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const seriesData = optionsCall.series[0].data;
    // Average of [90] = 90, which is >= 80
    expect(seriesData[0].itemStyle?.color).toBe("#ff0000");
    expect(seriesData[0].lineStyle?.color).toBe("#ff0000");
  });

  it("does not apply color when average does not match styling rule", () => {
    const singleSeriesData = {
      indicators: [{ name: "Speed", max: 100 }],
      series: [{ name: "Slow", values: [20] }],
    };
    const stylingRules = [{ id: "r1", operator: ">=" as const, value: 80, color: "#ff0000" }];
    render(<RadarChart data={singleSeriesData} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const seriesData = optionsCall.series[0].data;
    // Average of [20] = 20, which is < 80
    expect(seriesData[0].itemStyle?.color).toBeUndefined();
    expect(seriesData[0].lineStyle).toBeUndefined();
  });

  it("accepts paramValues prop without error", () => {
    const stylingRules = [{ id: "r1", operator: ">=" as const, value: 60, color: "#00ff00" }];
    const paramValues = { threshold: 60 };
    render(<RadarChart data={sampleData} stylingRules={stylingRules} paramValues={paramValues} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });
});
