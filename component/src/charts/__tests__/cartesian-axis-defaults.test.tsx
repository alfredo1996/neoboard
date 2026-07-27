import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BarChart } from "../bar-chart";
import { LineChart } from "../line-chart";
import { GanttChart } from "../gantt-chart";
import { registerNeoboardThemes, GRID_LINE_COLOR } from "../theme";

/**
 * Cross-chart axis and gridline defaults (#1247).
 *
 * Two failures this pins down:
 * 1. Gridline weight must come from the registered theme only — a chart that
 *    declares its own splitLine.lineStyle makes two widgets on one dashboard
 *    look like they came from different tools.
 * 2. A compact container (< 300px) may drop value numbers, but never the
 *    category identification — four unlabelled bars are not readable data.
 */

const mockSetOption = vi.fn();

const size = vi.hoisted(() => ({ width: 600, height: 400 }));

vi.mock("@/hooks/useContainerSize", () => ({
  useContainerSize: () => ({
    width: size.width,
    height: size.height,
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

type AxisOption = {
  type?: string;
  axisLabel?: { show?: boolean; formatter?: (v: string) => string };
  splitLine?: { show?: boolean; lineStyle?: unknown };
};

/** Render a chart and return the flattened x/y axis options it emitted. */
function axesOf(ui: React.ReactElement): AxisOption[] {
  render(ui);
  const opts = mockSetOption.mock.calls[0][0] as {
    xAxis?: AxisOption | AxisOption[];
    yAxis?: AxisOption | AxisOption[];
  };
  return [opts.xAxis, opts.yAxis].flat().filter(Boolean) as AxisOption[];
}

const categoryAxis = (axes: AxisOption[]) =>
  axes.find((a) => a.type === "category") as AxisOption;
const valueAxis = (axes: AxisOption[]) =>
  axes.find((a) => a.type === "value") as AxisOption;

const barData = [
  { label: "Electronics & Media", value: 100 },
  { label: "Home", value: 200 },
  { label: "Garden", value: 150 },
  { label: "Toys", value: 90 },
];

const lineData = [
  { x: "Jan", value: 10 },
  { x: "Feb", value: 20 },
  { x: "Mar", value: 15 },
];

const ganttData = [
  { task: "Design", start: 1700000000000, end: 1700500000000 },
  { task: "Build", start: 1700500000000, end: 1701000000000 },
];

describe("cartesian gridlines come from the theme (#1247)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    size.width = 600;
    size.height = 400;
  });

  it.each([
    ["bar", <BarChart key="b" data={barData} />],
    ["line", <LineChart key="l" data={lineData} />],
    ["gantt", <GanttChart key="g" data={ganttData} />],
  ])("%s chart declares no gridline style of its own", (_name, ui) => {
    for (const axis of axesOf(ui)) {
      expect(axis.splitLine?.lineStyle).toBeUndefined();
    }
  });

  it.each(["neoboard-light", "neoboard-dark"] as const)(
    "%s registers one gridline colour for category and value axes",
    (name) => {
      const themes: Record<string, Record<string, never>> = {};
      registerNeoboardThemes((themeName, theme) => {
        themes[themeName] = theme as Record<string, never>;
      });
      const theme = themes[name] as unknown as Record<
        string,
        { splitLine: { lineStyle: { color: string } } }
      >;
      const expected =
        GRID_LINE_COLOR[name === "neoboard-dark" ? "dark" : "light"];
      // timeAxis included: a time-series line chart and the gantt draw
      // ECharts' un-themed light-grey grid without it — glaring in dark.
      for (const axis of ["categoryAxis", "valueAxis", "timeAxis"]) {
        expect(theme[axis].splitLine.lineStyle.color).toBe(expected);
      }
    },
  );
});

describe("compact containers keep category identification (#1247)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    size.width = 280;
    size.height = 400;
  });

  it("bar chart still labels its categories", () => {
    const axis = categoryAxis(axesOf(<BarChart data={barData} />));
    expect(axis.axisLabel?.show).toBe(true);
  });

  it("bar chart truncates rather than dropping labels", () => {
    const axis = categoryAxis(axesOf(<BarChart data={barData} />));
    const formatter = axis.axisLabel?.formatter as (v: string) => string;
    expect(formatter("Electronics & Media")).toBe("Electroni…");
    expect(formatter("Home")).toBe("Home");
  });

  it("bar chart still drops the value numbers", () => {
    const axis = valueAxis(axesOf(<BarChart data={barData} />));
    expect(axis.axisLabel?.show).toBe(false);
  });

  it("line chart truncates long category labels like the bar chart does", () => {
    const axis = categoryAxis(
      axesOf(
        <LineChart
          data={[
            { x: "Electronics & Media", value: 10 },
            { x: "Home", value: 20 },
          ]}
        />,
      ),
    );
    const formatter = axis.axisLabel?.formatter as (v: string) => string;
    expect(formatter("Electronics & Media")).toBe("Electroni\u2026");
  });

  it("line chart still labels its x axis", () => {
    const axes = axesOf(<LineChart data={lineData} />);
    expect(categoryAxis(axes).axisLabel?.show).toBe(true);
    expect(valueAxis(axes).axisLabel?.show).toBe(false);
  });
});
