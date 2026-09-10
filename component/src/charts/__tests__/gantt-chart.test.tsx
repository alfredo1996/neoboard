import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GanttChart } from "../gantt-chart";

const mockSetOption = vi.fn();

const measured = { width: 800, height: 400 };

vi.mock("@/hooks/useContainerSize", () => ({
  useContainerSize: () => ({
    get width() {
      return measured.width;
    },
    get height() {
      return measured.height;
    },
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
  // The tooltip formatter runs echarts.format.encodeHTML on the task name.
  const format = {
    encodeHTML: (s: string) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
  };
  return {
    use,
    init,
    registerTheme,
    format,
    default: { use, init, registerTheme, format },
  };
});

const sampleData: Array<{
  task: string;
  start: number;
  end: number;
  category?: string;
  progress?: number;
}> = [
  {
    task: "Design",
    start: 1700000000000,
    end: 1700500000000,
    category: "Phase 1",
  },
  {
    task: "Develop",
    start: 1700300000000,
    end: 1701000000000,
    category: "Phase 1",
  },
  {
    task: "Test",
    start: 1700800000000,
    end: 1701200000000,
    category: "Phase 2",
  },
];

describe("GanttChart", () => {
  beforeEach(() => {
    measured.width = 800;
    measured.height = 400;
    vi.clearAllMocks();
  });

  it("renders without errors", () => {
    render(<GanttChart data={sampleData} />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("handles empty data with a No data title", () => {
    render(<GanttChart data={[]} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.title.text).toBe("No data");
  });

  it("uses custom series type for Gantt bars", () => {
    render(<GanttChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].type).toBe("custom");
  });

  it("sets time axis on xAxis", () => {
    render(<GanttChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.xAxis.type).toBe("time");
  });

  it("sets category axis on yAxis with task names", () => {
    render(<GanttChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.yAxis.type).toBe("category");
    expect(optionsCall.yAxis.data).toEqual(["Design", "Develop", "Test"]);
  });

  it("renders a today marker line by default", () => {
    render(<GanttChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    const markLine = optionsCall.series[0].markLine;
    expect(markLine).toBeDefined();
    expect(markLine.data[0].xAxis).toBeDefined();
  });

  it("hides today marker when showTodayLine is false", () => {
    render(<GanttChart data={sampleData} showTodayLine={false} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.series[0].markLine).toBeUndefined();
  });

  it("includes dataZoom for scrolling", () => {
    render(<GanttChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(optionsCall.dataZoom).toBeDefined();
    expect(optionsCall.dataZoom.length).toBeGreaterThan(0);
  });

  it("passes renderItem function to custom series", () => {
    render(<GanttChart data={sampleData} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    expect(typeof optionsCall.series[0].renderItem).toBe("function");
  });

  it("applies styling rule color to matching tasks", () => {
    const stylingRules = [
      {
        id: "r1",
        column: "category",
        operator: "==" as const,
        value: "Phase 2",
        color: "#ff0000",
      },
    ];
    render(<GanttChart data={sampleData} stylingRules={stylingRules} />);
    const optionsCall = mockSetOption.mock.calls[0][0];
    // The series data should contain the styling info for renderItem to use
    const seriesData = optionsCall.series[0].data;
    expect(seriesData).toHaveLength(3);
  });

  it("shows loading state", () => {
    render(<GanttChart data={sampleData} loading />);
    expect(screen.getByTestId("base-chart")).toBeInTheDocument();
  });

  it("shows error state", () => {
    render(<GanttChart data={sampleData} error={new Error("Fail")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Fail");
  });

  describe("measured grid (#1289)", () => {
    /** The option ECharts was handed. */
    const optionOf = (props: Parameters<typeof GanttChart>[0]) => {
      mockSetOption.mockClear();
      render(<GanttChart {...props} />);
      return mockSetOption.mock.calls[0][0];
    };

    it("sizes the grid in pixels and lets ECharts reserve the label gutter", () => {
      // "15%" only matched the 100px label budget at a 667px canvas; narrower
      // than that and the task names were hard-clipped. containLabel makes
      // ECharts measure the axis instead of us guessing a percentage.
      const { grid } = optionOf({ data: sampleData });
      expect(grid.containLabel).toBe(true);
      expect(typeof grid.left).toBe("number");
      expect(typeof grid.right).toBe("number");
      expect(String(grid.left)).not.toContain("%");
    });

    it("keeps room at the bottom for the zoom slider", () => {
      // slider height 20 + bottom 5 + gap.
      const { grid } = optionOf({ data: sampleData });
      expect(grid.bottom).toBe(40);
    });

    it("labels a sub-month range as dates rather than bare day numbers", () => {
      const { xAxis } = optionOf({ data: sampleData });
      expect(xAxis.axisLabel.formatter.day).toBe("{MMM} {d}");
      // The month template renders the tick AT a month boundary, mixed in with
      // day ticks — including the year there printed "May 2026" between
      // "Apr 29" and "May 3".
      expect(xAxis.axisLabel.formatter.month).toBe("{MMM}");
      expect(xAxis.axisLabel.formatter.year).toBe("{yyyy}");
    });

    it("keeps task names visible, truncating rather than hiding them", () => {
      const { yAxis } = optionOf({ data: sampleData });
      expect(yAxis.axisLabel.overflow).toBe("truncate");
      expect(yAxis.axisLabel.width).toBe(100);
    });

    it("tightens padding and the label budget in a narrow widget", () => {
      // A chart with no task names identifies nothing, so a narrow container
      // shrinks the budget rather than dropping the axis (#1247).
      measured.width = 240;
      const { grid, yAxis } = optionOf({ data: sampleData });
      expect(grid.left).toBe(8);
      expect(grid.right).toBe(8);
      expect(grid.top).toBe(8);
      expect(yAxis.axisLabel.width).toBe(60);
      expect(yAxis.axisLabel.overflow).toBe("truncate");
    });

    it("still reserves the slider room when compact", () => {
      measured.width = 240;
      const { grid } = optionOf({ data: sampleData });
      expect(grid.bottom).toBe(40);
    });
  });

  describe("tooltip dates (#1616)", () => {
    it("prints en-US dates rather than the browser's locale", () => {
      const start = new Date(2026, 3, 1).getTime();
      const end = new Date(2026, 3, 3).getTime();
      render(
        <GanttChart
          data={[{ task: "Design", start, end }]}
          ariaDescription="test"
        />,
      );

      const options = mockSetOption.mock.calls[0][0];
      const html = options.tooltip.formatter({
        // The custom series packs [taskIndex, start, end, duration, ...].
        value: [0, start, end, end - start],
        name: "Design",
      });

      expect(html).toContain("Apr 1, 2026 → Apr 3, 2026");
    });
  });

  describe("time-axis zoom (#1686)", () => {
    type Zoom = Record<string, unknown> & {
      type: string;
      xAxisIndex?: number;
      yAxisIndex?: number;
    };
    const optionOf = (props: Parameters<typeof GanttChart>[0]) => {
      mockSetOption.mockClear();
      render(<GanttChart {...props} />);
      return mockSetOption.mock.calls[0][0];
    };
    const xZooms = (zooms: Zoom[]) => zooms.filter((z) => z.xAxisIndex === 0);
    const xSlider = (zooms: Zoom[]) =>
      xZooms(zooms).find((z) => z.type === "slider");

    it("labels the slider handles with the datetime, not the axis tick precision", () => {
      // Without a labelFormatter the slider falls back to TimeScale.getLabel,
      // whose precision follows the tick interval: seconds on a two-week
      // range, a bare date once the ticks are years. The data are datetimes,
      // so the handle says so — every time, in a fixed shape.
      const { dataZoom } = optionOf({ data: sampleData });
      const formatter = xSlider(dataZoom)?.labelFormatter as (
        ms: number,
      ) => string;
      expect(formatter(new Date(2026, 3, 1, 9, 5).getTime())).toBe(
        "2026-04-01 09:05",
      );
    });

    it("keeps a bar while either end is inside the window", () => {
      // The custom series encodes x as [start, end]; the default 'filter'
      // mode drops an item when *either* dimension leaves the window, so
      // bars vanished at the edges as you zoomed in. Both x zooms, because
      // the wheel and the slider filter independently.
      const { dataZoom } = optionOf({ data: sampleData });
      expect(xZooms(dataZoom)).toHaveLength(2);
      for (const zoom of xZooms(dataZoom)) {
        expect(zoom.filterMode).toBe("weakFilter");
      }
    });

    it("leaves the slider on ECharts' own alignment to the plot", () => {
      // Verified against echarts 6.1.0 SliderZoomView._layout: with no
      // left/right the slider takes the coordinate system's rect, which is
      // the plot area *after* the task-label gutter. Copying grid.left/right
      // onto it — the obvious "fix" — widens the slider under the labels and
      // puts the handles off the data ends.
      const { dataZoom } = optionOf({ data: sampleData });
      const slider = xSlider(dataZoom);
      expect(slider).toBeDefined();
      expect(slider?.left).toBeUndefined();
      expect(slider?.right).toBeUndefined();
    });

    it("is on by default", () => {
      const { dataZoom, grid } = optionOf({ data: sampleData });
      expect(xSlider(dataZoom)).toBeDefined();
      expect(grid.bottom).toBe(40);
    });

    it("drops every time-axis zoom and the slider's room when off", () => {
      const { dataZoom, grid } = optionOf({
        data: sampleData,
        enableDataZoom: false,
      });
      expect(xZooms(dataZoom ?? [])).toEqual([]);
      expect(grid.bottom).toBe(16);
    });

    it("shrinks the freed room with the compact padding", () => {
      measured.width = 240;
      const { grid } = optionOf({ data: sampleData, enableDataZoom: false });
      expect(grid.bottom).toBe(8);
    });

    it("keeps the task-list scrollbar when off — it is not a zoom", () => {
      const many = Array.from({ length: 20 }, (_, i) => ({
        task: `Task ${i}`,
        start: 1700000000000 + i * 1000,
        end: 1700500000000 + i * 1000,
      }));
      const { dataZoom } = optionOf({ data: many, enableDataZoom: false });
      expect(xZooms(dataZoom)).toEqual([]);
      expect(
        (dataZoom as Zoom[]).filter((z) => z.yAxisIndex === 0),
      ).toHaveLength(2);
    });

    it("consumes the prop itself rather than handing it to BaseChart", () => {
      // BaseChart's own enableDataZoom merge replaces the whole dataZoom array
      // with two inside zooms — an explicit true would silently lose the
      // slider if the prop reached it.
      const { dataZoom } = optionOf({ data: sampleData, enableDataZoom: true });
      expect(xSlider(dataZoom)).toBeDefined();
    });
  });
});
