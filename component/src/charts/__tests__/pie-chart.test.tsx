import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  it("configures legend with scrollable type and enlarged pagination controls", () => {
    render(<PieChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.legend).toMatchObject({
      type: "scroll",
      bottom: 0,
      orient: "horizontal",
      pageIconSize: 12,
    });
    expect(optionsCall.legend.pageTextStyle.fontSize).toBe(11);
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

  // These previously asserted the ECharts template string ("{d}%" / "{c}"),
  // i.e. the implementation rather than the behaviour — so they broke when the
  // formatter became a function even though the output was correct. Now they
  // call the formatter and assert what a user would actually see (#1248).
  const runLabelFormatter = () =>
    mockSetOption.mock.calls[0][0].series[0].label.formatter({
      name: "Desktop",
      value: 60,
      percent: 60,
    });

  it("shows percentage in labels when showPercentage is true (default)", () => {
    render(<PieChart data={sampleData} />);
    expect(runLabelFormatter()).toBe("Desktop: 60.0%");
  });

  it("shows value instead of percentage when showPercentage is false", () => {
    render(<PieChart data={sampleData} showPercentage={false} />);
    const label = runLabelFormatter();
    expect(label).toBe("Desktop: 60");
    expect(label).not.toContain("%");
  });

  it("sorts slices by value descending when sortSlices is true", () => {
    render(<PieChart data={sampleData} sortSlices />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const values = (optionsCall.series[0].data as Array<{ value: number }>).map(
      (d) => d.value,
    );
    expect(values).toEqual([60, 30, 10]);
  });

  it("preserves original order when sortSlices is false (default)", () => {
    render(<PieChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const names = (optionsCall.series[0].data as Array<{ name: string }>).map(
      (d) => d.name,
    );
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
    const seriesData = optionsCall.series[0].data as Array<{
      name: string;
      value: number;
    }>;
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

  describe("theme reactivity (dark not frozen)", () => {
    afterEach(() => {
      document.documentElement.classList.remove("dark");
    });

    it("rebuilds theme-dependent colors on toggle instead of freezing at mount", () => {
      render(<PieChart data={sampleData} />);
      // Light mode: emphasis shadow is the dark-on-light variant.
      expect(JSON.stringify(mockSetOption.mock.calls.at(-1)![0])).toContain(
        "rgba(0, 0, 0, 0.5)",
      );

      act(() => {
        document.documentElement.classList.add("dark");
        globalThis.dispatchEvent(new Event("neoboard-theme-change"));
      });

      // After toggle the option is recomputed with the dark variant (before the
      // fix the memo froze and this stayed the light color).
      expect(JSON.stringify(mockSetOption.mock.calls.at(-1)![0])).toContain(
        "rgba(255, 255, 255, 0.15)",
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Number formatting (#1248)
// ---------------------------------------------------------------------------

describe("PieChart number formatting (#1248)", () => {
  // Values large enough that a missing thousands separator is visible, and
  // percentages that are not round so decimal precision is observable.
  const bigData = [
    { name: "Desktop", value: 1048 },
    { name: "Mobile", value: 735 },
    { name: "Tablet", value: 580 },
    { name: "Smart TV", value: 234 },
    { name: "Other", value: 154 },
  ];
  const total = bigData.reduce((s, d) => s + d.value, 0); // 2751

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const option = () => mockSetOption.mock.calls[0][0];

  it("formats the donut centre total with thousands separators", () => {
    // Was String(total) -> "2751", while KPI cards on the same dashboard
    // rendered "2,350". Mixed formatting in one view reads as untended.
    render(<PieChart data={bigData} donut />);
    const centre = option().graphic[0].style.text;
    expect(centre).toBe("2,751");
    expect(centre).not.toBe(String(total));
  });

  it("keeps an explicit donutCenterText untouched", () => {
    // Formatting the auto-total must not start formatting user-supplied text.
    render(<PieChart data={bigData} donut donutCenterText="All devices" />);
    expect(option().graphic[0].style.text).toBe("All devices");
  });

  it("renders label percentages to one decimal place", () => {
    // ECharts' {d} template defaults to 2dp ("38.09%"), which is precision
    // the data does not justify.
    render(<PieChart data={bigData} showPercentage />);
    const label = option().series[0].label.formatter({
      name: "Desktop",
      value: 1048,
      percent: 38.0952,
    });
    expect(label).toBe("Desktop: 38.1%");
  });

  it("formats label values with thousands separators when not showing percent", () => {
    render(<PieChart data={bigData} showPercentage={false} />);
    const label = option().series[0].label.formatter({
      name: "Desktop",
      value: 1048,
      percent: 38.0952,
    });
    expect(label).toBe("Desktop: 1,048");
  });

  it("formats the tooltip value and percentage consistently with the labels", () => {
    render(<PieChart data={bigData} />);
    const tip = option().tooltip.formatter({
      name: "Desktop",
      value: 1048,
      percent: 38.0952,
    });
    expect(tip).toContain("1,048");
    expect(tip).toContain("38.1%");
    expect(tip).not.toContain("38.09");
  });

  it("does not add trailing decimals to whole numbers", () => {
    // formatNumber defaults to 2dp when nothing is specified; passing
    // numberFormat alone must leave integers clean rather than "2,751.00".
    render(<PieChart data={bigData} donut />);
    expect(option().graphic[0].style.text).not.toMatch(/\.00$/);
  });
});

describe("PieChart tooltip escaping (#1248)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("escapes the slice name, which comes from query results", () => {
    // The tooltip return value is rendered as HTML by ECharts, and slice names
    // are user data. Building the string by hand made escaping our job — the
    // previous "{b}: {c} ({d}%)" template did not escape it either.
    render(
      <PieChart data={[{ name: "<img src=x onerror=alert(1)>", value: 1 }]} />,
    );
    const tip = mockSetOption.mock.calls[0][0].tooltip.formatter({
      name: "<img src=x onerror=alert(1)>",
      value: 1,
      percent: 100,
    });
    expect(tip).not.toContain("<img");
    expect(tip).toContain("&lt;img");
  });
});
