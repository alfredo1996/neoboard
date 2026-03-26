import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PieChart } from "../pie-chart";

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
  { name: "Desktop", value: 60 },
  { name: "Mobile", value: 30 },
  { name: "Tablet", value: 10 },
];

describe("PieChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without errors", () => {
    render(<PieChart data={sampleData} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<PieChart data={sampleData} className="my-pie" />);
    expect(screen.getByTestId("base-chart")).toHaveClass("my-pie");
  });

  it("builds pie series from data", () => {
    render(<PieChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series).toHaveLength(1);
    expect(optionsCall.series[0].type).toBe("pie");
    expect(optionsCall.series[0].data).toEqual(sampleData);
  });

  it("supports donut style", () => {
    render(<PieChart data={sampleData} donut />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].radius).toEqual(["40%", "70%"]);
  });

  it("hides labels when showLabel is false", () => {
    render(<PieChart data={sampleData} showLabel={false} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].label.show).toBe(false);
  });

  it("hides legend when showLegend is false", () => {
    render(<PieChart data={sampleData} showLegend={false} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.legend).toBeUndefined();
  });

  it("handles empty data", () => {
    render(<PieChart data={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.title.text).toBe("No data");
  });

  it("shows error state", () => {
    render(<PieChart data={sampleData} error={new Error("Broken")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Broken");
  });

  // --- New options ---

  it("enables rose mode", () => {
    render(<PieChart data={sampleData} roseMode />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].roseType).toBe("radius");
  });

  it("does not set roseType when roseMode is false", () => {
    render(<PieChart data={sampleData} roseMode={false} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].roseType).toBeUndefined();
  });

  it("sets label position to inside", () => {
    render(<PieChart data={sampleData} labelPosition="inside" />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].label.position).toBe("inside");
  });

  it("defaults label position to outside", () => {
    render(<PieChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].label.position).toBe("outside");
  });

  it("shows percentage in labels when showPercentage is true (default)", () => {
    render(<PieChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].label.formatter).toContain("{d}%");
  });

  it("shows value instead of percentage when showPercentage is false", () => {
    render(<PieChart data={sampleData} showPercentage={false} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].label.formatter).toContain("{c}");
    expect(optionsCall.series[0].label.formatter).not.toContain("{d}%");
  });

  it("sorts slices by value descending when sortSlices is true", () => {
    render(<PieChart data={sampleData} sortSlices />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const values = (optionsCall.series[0].data as Array<{ value: number }>).map((d) => d.value);
    expect(values).toEqual([60, 30, 10]);
  });

  it("preserves original order when sortSlices is false (default)", () => {
    render(<PieChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const names = (optionsCall.series[0].data as Array<{ name: string }>).map((d) => d.name);
    expect(names).toEqual(["Desktop", "Mobile", "Tablet"]);
  });

  // --- Donut center text ---

  it("shows custom donutCenterText in graphic when donut is enabled", () => {
    render(<PieChart data={sampleData} donut donutCenterText="Total: 100" />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.graphic).toBeDefined();
    expect(optionsCall.graphic[0].style.text).toBe("Total: 100");
  });

  it("shows auto-total in graphic when donut enabled without donutCenterText", () => {
    render(<PieChart data={sampleData} donut />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.graphic).toBeDefined();
    // 60 + 30 + 10 = 100
    expect(optionsCall.graphic[0].style.text).toBe("100");
  });

  it("does not show graphic when donut is false", () => {
    render(<PieChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.graphic).toBeUndefined();
  });

  // --- Top-N grouping ---

  it("groups slices beyond topN into Other", () => {
    render(<PieChart data={sampleData} topN={2} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const seriesData = optionsCall.series[0].data as Array<{ name: string; value: number }>;
    expect(seriesData).toHaveLength(3); // 2 top + "Other"
    expect(seriesData[2].name).toBe("Other");
    expect(seriesData[2].value).toBe(10);
  });

  it("shows all slices when topN is 0", () => {
    render(<PieChart data={sampleData} topN={0} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const seriesData = optionsCall.series[0].data as Array<{ name: string }>;
    expect(seriesData).toHaveLength(3);
  });
});
