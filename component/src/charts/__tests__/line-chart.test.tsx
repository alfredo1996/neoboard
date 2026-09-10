import type { ComponentProps } from "react";
import { withNullAt } from "./fixtures/connector-output";
import { act, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LineChart } from "../line-chart";
import { BarChart } from "../bar-chart";
import { resolveSeriesPalette } from "../base-chart";
import { fadeToTransparent, resolveItemColor } from "../chart-utils";

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

  describe("area fill: light only (#1264)", () => {
    // seriesColor comes from a matched styling rule, not the colors prop —
    // that is what activates the gradient branch of areaStyle.
    const amberRule = [
      { id: "r1", operator: ">=" as const, value: 0, color: "#f9a91f" },
    ];

    afterEach(() => document.documentElement.classList.remove("dark"));

    const areaStyleOf = () =>
      mockSetOption.mock.calls[0][0].series[0].areaStyle;

    it.each([
      ["with a resolved series colour", amberRule],
      ["with no series colour (default path)", undefined],
    ])("omits the fill entirely in dark mode %s", (_label, rules) => {
      // A warm fill over charcoal composites to brown at ANY alpha — the
      // technique is the problem, not the value. #1244 lowered the opacity and
      // it still read as a stain, so dark drops the fill and keeps the line.
      // Both paths asserted: #1244 fixed only the styling-rule branch and left
      // the default one muddy precisely because they were tested separately.
      document.documentElement.classList.add("dark");
      render(<LineChart data={sampleData} area stylingRules={rules} />);
      expect(areaStyleOf()).toBeUndefined();
    });

    it.each([
      ["with a resolved series colour", amberRule, 0.15],
      ["with no series colour (default path)", undefined, 0.12],
    ])("keeps the fill in light mode %s", (_label, rules, opacity) => {
      render(<LineChart data={sampleData} area stylingRules={rules} />);
      expect(areaStyleOf().opacity).toBe(opacity);
    });

    it("fades the light gradient to the same hue, never to transparent white", () => {
      // Canvas interpolates gradients in non-premultiplied RGBA, so fading to
      // rgba(255,255,255,0) washes a saturated colour through pale grey.
      render(<LineChart data={sampleData} area stylingRules={amberRule} />);
      const stops = areaStyleOf().color.colorStops;
      const last = stops[stops.length - 1].color;
      expect(last).not.toMatch(/255,\s*255,\s*255/);
      // Assert the exact fadeToTransparent output, not just the hue: an
      // OPAQUE same-hue colour ("#f9a91f") would satisfy a hue-only check
      // while completely defeating the fade this test exists to protect.
      expect(last).toBe(fadeToTransparent("#f9a91f"));
      expect(last).toMatch(/00$/);
    });

    const lastAreaStyleOf = () =>
      mockSetOption.mock.calls[mockSetOption.mock.calls.length - 1][0].series[0]
        .areaStyle;

    // Toggling the theme on a MOUNTED chart. Every test above sets the class
    // before render and reads calls[0], which is exactly why #1286 survived:
    // the memo read the theme once at mount and never rebuilt, so light → dark
    // left the warm wash sitting over charcoal until the widget re-queried.
    const toggleTo = (theme: "dark" | "light") => {
      document.documentElement.classList.toggle("dark", theme === "dark");
      act(() => {
        globalThis.dispatchEvent(new Event("neoboard-theme-change"));
      });
    };

    it.each([
      ["with a resolved series colour", amberRule, 0.15],
      ["with no series colour (default path)", undefined, 0.12],
    ])("drops the fill when toggled light → dark %s", (_l, rules, opacity) => {
      render(<LineChart data={sampleData} area stylingRules={rules} />);
      expect(areaStyleOf().opacity).toBe(opacity);
      toggleTo("dark");
      expect(lastAreaStyleOf()).toBeUndefined();
    });

    it.each([
      ["with a resolved series colour", amberRule, 0.15],
      ["with no series colour (default path)", undefined, 0.12],
    ])(
      "restores the fill when toggled dark → light %s",
      (_l, rules, opacity) => {
        document.documentElement.classList.add("dark");
        render(<LineChart data={sampleData} area stylingRules={rules} />);
        expect(areaStyleOf()).toBeUndefined();
        toggleTo("light");
        expect(lastAreaStyleOf().opacity).toBe(opacity);
      },
    );

    it('re-colors the "No data" label on toggle (#1286)', () => {
      // Same root cause as the fill: buildEmptyDataOption() read the theme
      // from the DOM inside the memo body, so the empty label kept the
      // previous theme's grey. Asserted on LineChart because BarChart's empty
      // state is DOM, not canvas (#1053) — its option never reaches ECharts.
      render(<LineChart data={[]} />);
      const colorOf = (i: number) =>
        mockSetOption.mock.calls[i][0].title.textStyle.color;
      expect(colorOf(0)).toBe("#666d7a");
      toggleTo("dark");
      expect(colorOf(mockSetOption.mock.calls.length - 1)).toBe("#959ba7");
    });

    it("still draws the line itself in dark mode", () => {
      // Dropping the fill must not drop the series — the chart still has to
      // render, just without the wash.
      document.documentElement.classList.add("dark");
      render(<LineChart data={sampleData} area />);
      const series = mockSetOption.mock.calls[0][0].series[0];
      expect(series.type).toBe("line");
      expect(series.lineStyle.width).toBe(1.5);
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

  describe("decimalPlaces (#1581)", () => {
    const param = [{ name: "Jan", seriesName: "y", value: 1234.567 }];

    it("rounds tooltip values to the requested places", () => {
      render(
        <LineChart data={[{ x: "Jan", y: 1234.567 }]} decimalPlaces={0} />,
      );
      const option = mockSetOption.mock.calls[0][0];
      expect(option.tooltip.formatter(param)).toContain("1,235");
    });

    it("treats the automatic sentinel like an unset option", () => {
      render(
        <LineChart data={[{ x: "Jan", y: 1234.567 }]} decimalPlaces={-1} />,
      );
      const option = mockSetOption.mock.calls[0][0];
      expect(option.tooltip.formatter(param)).toContain("1,234.567");
    });
  });
});

describe("connector-shaped fixtures (#1636)", () => {
  // A sparse LEFT JOIN result has a null point. It must reach ECharts as null
  // so the line breaks there (or connectNulls bridges it) — a chart that
  // coerced it to 0 would dive to the axis on every gap.
  const sparse = withNullAt(
    sampleData as Array<Record<string, unknown>>,
    "y",
    1,
  ) as ComponentProps<typeof LineChart>["data"];

  // A neighbouring test's late re-render can land a setOption call here under
  // shuffle (CI seed 1788893237062: a 2,000-point sampling series arrived at
  // calls[0]). Pick the option that carries THIS chart's three-point series.
  const mine = () =>
    mockSetOption.mock.calls
      .map((c) => c[0])
      .find((o) => o?.series?.[0]?.data?.length === 3);

  it("passes a null point through as null, never as zero", () => {
    mockSetOption.mockClear();
    render(<LineChart data={sparse} />);
    const optionsCall = mine();
    expect(optionsCall.series[0].data).toEqual([100, null, 150]);
  });

  it("keeps the null when connectNulls bridges the gap visually", () => {
    mockSetOption.mockClear();
    render(<LineChart data={sparse} connectNulls />);
    const optionsCall = mine();
    expect(optionsCall.series[0].data).toEqual([100, null, 150]);
    expect(optionsCall.series[0].connectNulls).toBe(true);
  });
});

describe("styling rules colour each point by its own value (#1417)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const blue = "#2563eb";
  const red = "#ef4444";
  // The seeded "Weekly revenue — colored by magnitude" rules.
  const thresholdRules = [
    { id: "hi", operator: ">=" as const, value: 10000, color: blue },
    { id: "lo", operator: "<" as const, value: 10000, color: red },
  ];
  // Rises through the threshold and ends far above it — the shape that drew
  // the whole seeded line blue, because only the last point was consulted.
  const revenues = [2000, 6000, 10000, 40000, 130000];
  const categoryData = revenues.map((revenue, i) => ({
    x: `W${i + 1}`,
    revenue,
  }));
  const timeData = revenues.map((revenue, i) => ({
    x: `2024-01-0${i + 1}`,
    revenue,
  }));

  type Piece = {
    gt?: number;
    gte?: number;
    lt?: number;
    lte?: number;
    value?: number;
    color: string;
  };
  type Option = {
    visualMap?: Array<{ seriesIndex: number; pieces: Piece[] }>;
    series: Array<{ lineStyle: { color?: string }; data: unknown[] }>;
  };

  /** The interval test ECharts' piecewise visualMap runs for a value. */
  const pieceColour = (pieces: Piece[], v: number) =>
    pieces.find((p) =>
      p.value === undefined
        ? (p.gt === undefined || v > p.gt) &&
          (p.gte === undefined || v >= p.gte) &&
          (p.lt === undefined || v < p.lt) &&
          (p.lte === undefined || v <= p.lte)
        : p.value === v,
    )?.color;

  const optionFor = (props: ComponentProps<typeof LineChart>): Option => {
    render(<LineChart {...props} />);
    return mockSetOption.mock.calls[mockSetOption.mock.calls.length - 1][0];
  };

  /** The colour series `i` is drawn in where it passes through value `v`. */
  const lineColourAt = (option: Option, i: number, v: number) => {
    const map = option.visualMap?.find((m) => m.seriesIndex === i);
    return map ? pieceColour(map.pieces, v) : option.series[i].lineStyle.color;
  };

  it.each([
    ["category", categoryData],
    ["time", timeData],
  ])(
    "draws a %s-axis line that crosses a threshold in more than one colour",
    (_axis, data) => {
      const option = optionFor({ data, stylingRules: thresholdRules });
      const colours = revenues.map((v) => lineColourAt(option, 0, v));
      expect(new Set(colours).size).toBeGreaterThan(1);
      // A line colour would override the per-value gradient.
      expect(option.series[0].lineStyle.color).toBeUndefined();
      expect(option.visualMap?.[0]).toMatchObject({
        type: "piecewise",
        show: false,
        seriesIndex: 0,
        // The value dimension on both axis types: ECharts only draws the
        // gradient along an x or y dimension.
        dimension: 1,
      });
    },
  );

  it("gives each point the colour of the rule its own value satisfies", () => {
    const option = optionFor({
      data: categoryData,
      stylingRules: thresholdRules,
    });
    // 10000 sits exactly on the bound: `>=` owns it, `<` does not.
    expect(revenues.map((v) => lineColourAt(option, 0, v))).toEqual([
      red,
      red,
      blue,
      blue,
      blue,
    ]);
  });

  it("agrees with the bar chart on every point for the same rule", () => {
    render(
      <BarChart
        data={revenues.map((revenue, i) => ({ label: `W${i + 1}`, revenue }))}
        stylingRules={thresholdRules}
      />,
    );
    const barColours = (
      mockSetOption.mock.calls[0][0].series[0].data as Array<{
        itemStyle: { color: string };
      }>
    ).map((d) => d.itemStyle.color);

    const option = optionFor({
      data: categoryData,
      stylingRules: thresholdRules,
    });
    expect(revenues.map((v) => lineColourAt(option, 0, v))).toEqual(barColours);
  });

  it("includes both bounds of a between rule", () => {
    const green = "#16a34a";
    const option = optionFor({
      data: categoryData,
      stylingRules: [
        {
          id: "b",
          operator: "between",
          value: 6000,
          valueTo: 40000,
          color: green,
        },
      ],
    });
    const colours = revenues.map((v) => lineColourAt(option, 0, v));
    expect(colours.slice(1, 4)).toEqual([green, green, green]);
    expect(colours[0]).not.toBe(green);
    expect(colours[4]).not.toBe(green);
  });

  it("reads a threshold from a parameter", () => {
    const option = optionFor({
      data: categoryData,
      stylingRules: [
        { id: "p", operator: ">=", value: 0, parameterRef: "t", color: blue },
      ],
      paramValues: { t: 10000 },
    });
    expect(lineColourAt(option, 0, 6000)).not.toBe(blue);
    expect(lineColourAt(option, 0, 10000)).toBe(blue);
  });

  it("keeps each series' own palette colour where no rule matches", () => {
    const palette = resolveSeriesPalette();
    const option = optionFor({
      data: revenues.map((revenue, i) => ({
        x: `W${i + 1}`,
        revenue,
        cost: revenue,
      })),
      stylingRules: [thresholdRules[0]],
    });
    expect(lineColourAt(option, 0, 2000)).toBe(palette[0]);
    expect(lineColourAt(option, 1, 2000)).toBe(palette[1]);
    expect(lineColourAt(option, 1, 40000)).toBe(blue);
  });

  it("keeps a single line colour when every point satisfies the same rule", () => {
    const option = optionFor({
      data: categoryData,
      // Two rules, one colour: every point resolves to blue.
      stylingRules: [thresholdRules[0], { ...thresholdRules[0], value: 0 }],
    });
    expect(option.visualMap).toBeUndefined();
    expect(option.series[0].lineStyle.color).toBe(blue);
  });

  it("adds no visual map without styling rules", () => {
    expect(optionFor({ data: categoryData }).visualMap).toBeUndefined();
  });

  // Review of #1734: a text rule has no numeric bound, so there is no gap to
  // sample. A single open-ended piece made ECharts 6.1.0 throw in
  // LineView.getVisualGradient and the widget lost its line.
  it("emits no visual map when no rule has a numeric bound", () => {
    const option = optionFor({
      data: [1, 1.5, 2].map((revenue, i) => ({ x: `W${i}`, revenue })),
      stylingRules: [{ id: "t", operator: "contains", value: ".", color: red }],
    });
    expect(option.visualMap).toBeUndefined();
  });

  const green = "#16a34a";
  const amber = "#f59e0b";
  it.each([
    // Descending bounds in rule order: [100000, 50000] unsorted.
    [
      "descending, overlapping",
      [
        { id: "g", operator: ">=" as const, value: 100000, color: green },
        { id: "a", operator: ">=" as const, value: 50000, color: amber },
        { id: "r", operator: "<" as const, value: 50000, color: red },
      ],
      [20000, 60000, 100000, 120000],
    ],
    // Ascending numerically, but "10000" sorts before "9000" as text.
    [
      "lexicographically misordered",
      [
        { id: "r", operator: "<" as const, value: 9000, color: red },
        { id: "a", operator: "<" as const, value: 10000, color: amber },
        { id: "b", operator: ">=" as const, value: 10000, color: blue },
      ],
      [8000, 9500, 10000, 12000],
    ],
  ])(
    "matches the rule engine's first match with %s bounds",
    (_label, rules, values) => {
      const option = optionFor({
        data: values.map((revenue, i) => ({ x: `W${i}`, revenue })),
        stylingRules: rules,
      });
      const probes = [
        ...values,
        ...rules.flatMap((r) => [r.value - 1, r.value, r.value + 1]),
      ];
      for (const v of probes) {
        expect(lineColourAt(option, 0, v)).toBe(resolveItemColor(v, rules));
      }
    },
  );

  it.each(["<=", ">", "==", "!="] as const)(
    "colours a line at and around the bound for %s",
    (operator) => {
      const rules = [{ id: "o", operator, value: 3, color: green }];
      const option = optionFor({
        data: [1, 2, 3, 4, 5].map((y, i) => ({ x: `P${i}`, y })),
        stylingRules: rules,
      });
      const palette = resolveSeriesPalette();
      for (const v of [2, 2.5, 3, 3.5, 4]) {
        expect(lineColourAt(option, 0, v)).toBe(
          resolveItemColor(v, rules) ?? palette[0],
        );
      }
    },
  );

  it("reads both bounds of a between rule from parameters", () => {
    const option = optionFor({
      data: categoryData,
      stylingRules: [
        {
          id: "b",
          operator: "between",
          value: 0,
          parameterRef: "a",
          // Disagrees with the parameter on purpose: the parameter wins.
          valueTo: 0,
          parameterRefTo: "b",
          color: green,
        },
      ],
      paramValues: { a: 6000, b: 40000 },
    });
    expect(lineColourAt(option, 0, 40000)).toBe(green);
    expect(lineColourAt(option, 0, 40001)).not.toBe(green);
    expect(lineColourAt(option, 0, 130000)).not.toBe(green);
  });

  it("falls back to the chosen palette, not the default one", () => {
    const palette = resolveSeriesPalette("tableau");
    expect(palette).not.toEqual(resolveSeriesPalette());
    const option = optionFor({
      data: revenues.map((revenue, i) => ({
        x: `W${i + 1}`,
        revenue,
        cost: revenue,
      })),
      stylingRules: [thresholdRules[0]],
      colorPalette: "tableau",
    });
    expect(lineColourAt(option, 0, 2000)).toBe(palette[0]);
    expect(lineColourAt(option, 1, 2000)).toBe(palette[1]);
  });

  it("marks a point that only a zero-width rule (==) matches", () => {
    type SymbolOption = Option & { series: Array<{ showSymbol?: boolean }> };
    const option = optionFor({
      data: [1, 2, 3, 4, 5].map((y, i) => ({ x: `P${i}`, y })),
      stylingRules: [{ id: "e", operator: "==", value: 3, color: green }],
    }) as SymbolOption;
    // The gradient gives 3 no width, so only a symbol can show the match;
    // ECharts colours symbols from the same visual map.
    expect(option.series[0].showSymbol).toBe(true);
    expect(lineColourAt(option, 0, 3)).toBe(green);
  });

  it("keeps symbols off when every rule colour has width on the line", () => {
    const option = optionFor({
      data: categoryData,
      stylingRules: thresholdRules,
    }) as Option & { series: Array<{ showSymbol?: boolean }> };
    expect(option.series[0].showSymbol).toBe(false);
  });
});

describe("LineChart — raw-row passthrough (#1598)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const seriesNames = () =>
    mockSetOption.mock.calls[0][0].series.map((s: { name: string }) => s.name);

  it("does not draw the app's properties container as a series", () => {
    const data = [
      { x: "Jan", revenue: 1, properties: { month: "Jan", revenue: 1 } },
    ] as unknown as ComponentProps<typeof LineChart>["data"];
    render(<LineChart data={data} />);
    expect(seriesNames()).toEqual(["revenue"]);
  });

  it("still draws a numeric series that is itself named properties", () => {
    render(<LineChart data={[{ x: "Jan", properties: 4 }]} />);
    expect(seriesNames()).toEqual(["properties"]);
  });
});
