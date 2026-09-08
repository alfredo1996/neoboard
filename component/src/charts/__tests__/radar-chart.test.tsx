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
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 80, color: "#ff0000" },
    ];
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
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 80, color: "#ff0000" },
    ];
    render(<RadarChart data={singleSeriesData} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const seriesData = optionsCall.series[0].data;
    // Average of [20] = 20, which is < 80
    expect(seriesData[0].itemStyle?.color).toBeUndefined();
    expect(seriesData[0].lineStyle).toBeUndefined();
  });

  it("averages only the measured axes for styling rules (#1655)", () => {
    const data = {
      indicators: [
        { name: "Speed", max: 100 },
        { name: "Strength", max: 100 },
      ],
      series: [{ name: "Partial", values: [80, null] }],
    };
    const stylingRules = [
      { id: "r1", operator: "<" as const, value: 50, color: "#ff0000" },
    ];
    render(<RadarChart data={data} stylingRules={stylingRules} />);
    const seriesData = mockSetOption.mock.calls[0][0].series[0].data;
    // `sum + null` is `sum + 0`, so the mean used to be 40 and "< 50 => red"
    // fired on a series whose only measurement was 80.
    expect(seriesData[0].itemStyle?.color).toBeUndefined();
    expect(seriesData[0].lineStyle).toBeUndefined();
  });

  it("renders no label for an unmeasured axis when showValues is on (#1655)", () => {
    const data = {
      indicators: [
        { name: "Speed", max: 100 },
        { name: "Strength", max: 100 },
      ],
      series: [{ name: "Partial", values: [80, null] }],
    };
    render(<RadarChart data={data} showValues />);
    // ECharts calls the radar label formatter once PER AXIS with that axis'
    // scalar (verified by rendering — it is not handed the whole array), so
    // an unguarded String() would print the literal text "null" on the canvas.
    const fmt =
      mockSetOption.mock.calls[0][0].series[0].data[0].label.formatter;
    expect(fmt({ value: 80 })).toBe("80");
    expect(fmt({ value: null })).toBe("");
  });

  it("accepts paramValues prop without error", () => {
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 60, color: "#00ff00" },
    ];
    const paramValues = { threshold: 60 };
    render(
      <RadarChart
        data={sampleData}
        stylingRules={stylingRules}
        paramValues={paramValues}
      />,
    );
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });
});
