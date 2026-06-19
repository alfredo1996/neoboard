import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SunburstChart } from "../sunburst-chart";

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
  {
    name: "Root",
    value: 100,
    children: [
      { name: "A", value: 40 },
      { name: "B", value: 60 },
    ],
  },
];

const flatData = [
  { name: "X", value: 30 },
  { name: "Y", value: 70 },
];

describe("SunburstChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without errors", () => {
    render(<SunburstChart data={sampleData} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("handles empty data with a No data title", () => {
    render(<SunburstChart data={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.title.text).toBe("No data");
  });

  it("sets sunburst type on series", () => {
    render(<SunburstChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].type).toBe("sunburst");
  });

  it("uses the white+soft-shadow label treatment on the series and emphasis labels", () => {
    render(<SunburstChart data={sampleData} highlightOnHover />);
    const series = mockSetOption.mock.calls[0][0].series[0];
    expect(series.label.color).toBe("#ffffff");
    expect(series.label.textShadowColor).toBe("rgba(0, 0, 0, 0.55)");
    expect(series.emphasis.label.color).toBe("#ffffff");
    expect(series.emphasis.label.textShadowColor).toBe("rgba(0, 0, 0, 0.55)");
  });

  it("omits the emphasis block when highlightOnHover is disabled", () => {
    render(<SunburstChart data={sampleData} highlightOnHover={false} />);
    const series = mockSetOption.mock.calls[0][0].series[0];
    expect(series.emphasis).toEqual({});
  });

  it("renders levels beyond maxLabelDepth with transparent labels", () => {
    const deep = [
      {
        name: "Root",
        value: 100,
        children: [
          { name: "Mid", value: 100, children: [{ name: "Leaf", value: 100 }] },
        ],
      },
    ];
    render(<SunburstChart data={deep} maxLabelDepth={1} />);
    const series = mockSetOption.mock.calls[0][0].series[0];
    const hidden = series.levels.find(
      (l: { label?: { color?: string } }) => l.label?.color === "transparent",
    );
    expect(hidden).toBeTruthy();
    expect(hidden.label.textShadowBlur).toBe(0);
  });

  it("shows loading state", () => {
    render(<SunburstChart data={sampleData} loading />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<SunburstChart data={sampleData} error={new Error("Fail")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Fail");
  });

  // --- styling rules ---

  it("applies styling rule color to flat items that match rule", () => {
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 50, color: "#ff0000" },
    ];
    render(<SunburstChart data={flatData} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const seriesData = optionsCall.series[0].data;
    // Y has value 70 which is >= 50
    const itemY = seriesData.find((d: { name: string }) => d.name === "Y");
    expect(itemY?.itemStyle?.color).toBe("#ff0000");
  });

  it("does not apply color when value does not match styling rule", () => {
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 50, color: "#ff0000" },
    ];
    render(<SunburstChart data={flatData} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const seriesData = optionsCall.series[0].data;
    // X has value 30 which is < 50
    const itemX = seriesData.find((d: { name: string }) => d.name === "X");
    expect(itemX?.itemStyle?.color).toBeUndefined();
  });

  it("passes raw data through when no stylingRules provided", () => {
    render(<SunburstChart data={flatData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].data).toEqual(flatData);
  });

  it("accepts paramValues prop without error", () => {
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 30, color: "#00ff00" },
    ];
    const paramValues = { threshold: 30 };
    render(
      <SunburstChart
        data={flatData}
        stylingRules={stylingRules}
        paramValues={paramValues}
      />,
    );
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });
});
