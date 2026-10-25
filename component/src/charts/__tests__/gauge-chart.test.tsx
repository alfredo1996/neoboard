import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GaugeChart } from "../gauge-chart";
import { TODAY_LINE_COLOR, TRACK_COLOR } from "../theme";

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

  it("defaults the progress arc to the Hastings citrine, not stock blue (#2226)", () => {
    render(<GaugeChart data={sampleData} />);
    const color = mockSetOption.mock.calls[0][0].series[0].progress.itemStyle
      .color as string;
    expect(color).toBe("#C47C08");
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

  // #2228
  const series = () => mockSetOption.mock.calls[0][0].series[0];

  it("prints min and max at the ends of the arc", () => {
    render(<GaugeChart data={sampleData} min={0} max={8000} />);
    const { axisLabel, splitNumber } = series();
    expect(axisLabel.show).toBe(true);
    expect(splitNumber).toBe(1);
    expect([axisLabel.formatter(0), axisLabel.formatter(8000)]).toEqual([
      "0",
      "8,000",
    ]);
  });

  it("rounds to one decimal and appends the author's unit", () => {
    const { unmount } = render(<GaugeChart data={[{ value: 20.05 }]} />);
    expect(series().detail.formatter(20.05)).toBe("20.1");
    unmount();
    mockSetOption.mockClear();
    render(<GaugeChart data={[{ value: 20.05 }]} unit="%" />);
    expect(series().detail.formatter(20.05)).toBe("20.1%");
  });

  it("draws a 12px arc on a visible track", () => {
    render(<GaugeChart data={sampleData} />);
    expect(series().progress.width).toBe(12);
    expect(series().axisLine.lineStyle.width).toBe(12);
    const stops = series().axisLine.lineStyle.color;
    expect(stops).toHaveLength(1);
    expect(stops[0][1]).toBe("#EEF0F3");
  });

  it("turns threshold zones into ticks on the track, not coloured bands", () => {
    const zones = JSON.stringify([
      { value: 30, color: "#ff0000" },
      { value: 100, color: "#00ff00" },
    ]);
    render(<GaugeChart data={sampleData} thresholdZones={zones} />);
    const [track, ticks] = mockSetOption.mock.calls[0][0].series;
    // the 30-100 zone is not painted: the track stays one visible colour
    expect(track.axisLine.lineStyle.color).toEqual([[1, "#EEF0F3"]]);
    const stops = ticks.axisLine.lineStyle.color as [number, string][];
    expect(stops.find(([, c]) => c === "#ff0000")?.[0]).toBeCloseTo(0.3, 2);
    expect(stops.some(([, c]) => c === "#00ff00")).toBe(false);
  });

  it("formats the tooltip and the aria label like the face", () => {
    const { container } = render(
      <GaugeChart data={[{ value: 20.05, name: "Score" }]} unit="%" />,
    );
    const { tooltip } = mockSetOption.mock.calls[0][0];
    expect(tooltip.formatter({ name: "Score", value: 20.05 })).toBe(
      "Score: 20.1%",
    );
    expect(container.querySelector("[aria-label]")).toHaveAttribute(
      "aria-label",
      "Gauge showing 20.1% of 0 to 100",
    );
  });

  it.each(["light", "dark"] as const)(
    "takes the track and scale ink from the theme in %s",
    (mode) => {
      document.documentElement.classList.toggle("dark", mode === "dark");
      try {
        render(<GaugeChart data={sampleData} />);
        const s = series();
        expect(s.axisLabel.color).toBe(TODAY_LINE_COLOR[mode]);
        expect(s.axisLine.lineStyle.color).toEqual([[1, TRACK_COLOR[mode]]]);
        // the name takes the theme's ink-3, like the end labels
        expect(s.title.color).toBeUndefined();
      } finally {
        document.documentElement.classList.remove("dark");
      }
    },
  );

  it("skips a tick within 0.8% of the last one, and draws none at max", () => {
    const zones = JSON.stringify([
      { value: 30, color: "#ff0000" },
      { value: 30.5, color: "#00ff00" },
      { value: 100, color: "#0000ff" },
    ]);
    render(<GaugeChart data={sampleData} thresholdZones={zones} />);
    const ticks = mockSetOption.mock.calls[0][0].series[1].axisLine.lineStyle
      .color as [number, string][];
    const colors = ticks.map(([, c]) => c);
    expect(colors).toContain("#ff0000");
    expect(colors).not.toContain("#00ff00");
    expect(colors).not.toContain("#0000ff");
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
