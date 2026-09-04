import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TreemapChart } from "../treemap-chart";

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
  { name: "Alpha", value: 100 },
  { name: "Beta", value: 200 },
  { name: "Gamma", value: 50 },
];

describe("TreemapChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without errors", () => {
    render(<TreemapChart data={sampleData} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("handles empty data with a No data title", () => {
    render(<TreemapChart data={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.title.text).toBe("No data");
  });

  it("sets treemap type on series", () => {
    render(<TreemapChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].type).toBe("treemap");
  });

  it("passes data to series", () => {
    render(<TreemapChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].data).toEqual(sampleData);
  });

  it("labels are white with a soft shadow so they read on light- and dark-tinted cells", () => {
    render(<TreemapChart data={sampleData} />);
    const { label } = mockSetOption.mock.calls[0][0].series[0];
    expect(label.color).toBe("#ffffff");
    expect(label.textShadowColor).toBe("rgba(0, 0, 0, 0.55)");
    expect(label.textShadowBlur).toBeGreaterThan(0);
  });

  it("shows loading state", () => {
    render(<TreemapChart data={sampleData} loading />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<TreemapChart data={sampleData} error={new Error("Fail")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Fail");
  });

  // --- styling rules ---

  it("applies styling rule color to items that match rule", () => {
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 150, color: "#ff0000" },
    ];
    render(<TreemapChart data={sampleData} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const seriesData = optionsCall.series[0].data;
    // Beta has value 200 which is >= 150
    const beta = seriesData.find((d: { name: string }) => d.name === "Beta");
    expect(beta?.itemStyle?.color).toBe("#ff0000");
  });

  it("does not apply color to items that do not match styling rule", () => {
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 150, color: "#ff0000" },
    ];
    render(<TreemapChart data={sampleData} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const seriesData = optionsCall.series[0].data;
    // Alpha has value 100 which is < 150
    const alpha = seriesData.find((d: { name: string }) => d.name === "Alpha");
    expect(alpha?.itemStyle?.color).toBeUndefined();
  });

  it("passes raw data through when no stylingRules provided", () => {
    render(<TreemapChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].data).toEqual(sampleData);
  });

  it("accepts paramValues prop without error", () => {
    const stylingRules = [
      { id: "r1", operator: ">=" as const, value: 100, color: "#00ff00" },
    ];
    const paramValues = { threshold: 100 };
    render(
      <TreemapChart
        data={sampleData}
        stylingRules={stylingRules}
        paramValues={paramValues}
      />,
    );
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  describe("native drill vs a configured click action (#1596)", () => {
    it("keeps native drill when no click action is configured", () => {
      render(<TreemapChart data={sampleData} />);
      const option = mockSetOption.mock.calls[0][0];
      expect(option.series[0].nodeClick).toBe("zoomToNode");
    });

    it("suppresses native drill when a click action is configured", () => {
      // Otherwise one click both fires the action and moves the view.
      render(<TreemapChart data={sampleData} onClick={() => {}} />);
      const option = mockSetOption.mock.calls[0][0];
      expect(option.series[0].nodeClick).toBe(false);
    });
  });
});
