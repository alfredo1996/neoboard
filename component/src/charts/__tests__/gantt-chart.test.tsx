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

    it("sizes the name column from the longest name, in pixels (#2231)", () => {
      // "15%" only matched a 100px label budget at a 667px canvas. The column
      // is measured now: the longest name plus an 18px gap. jsdom has no
      // canvas, so the measure is 0.6em (6.6px at 11px) per character.
      const short = optionOf({ data: sampleData }); // longest: "Develop", 7
      expect(short.grid.containLabel).toBe(false);
      expect(short.grid.left).toBe(Math.ceil(7 * 6.6) + 18);
      const long = optionOf({
        data: [{ ...sampleData[0], task: "A considerably longer task name" }],
      }); // 31 characters
      expect(long.grid.left).toBe(Math.ceil(31 * 6.6) + 18);
      expect(typeof short.grid.right).toBe("number");
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

    it("shows whole names, with no hard-coded 60/100 budget", () => {
      const { yAxis } = optionOf({ data: sampleData });
      expect(yAxis.axisLabel.width).toBeUndefined();
      expect(yAxis.axisLabel.overflow).toBeUndefined();
    });

    it("caps the column at half a narrow widget and truncates to fit it", () => {
      // A chart with no task names identifies nothing, so the column stays,
      // but it never takes more than half the widget (#1247, #2231).
      measured.width = 240;
      const { grid, yAxis } = optionOf({
        data: [{ ...sampleData[0], task: "x".repeat(60) }],
      });
      expect(grid.left).toBe(120);
      expect(yAxis.axisLabel.width).toBe(120 - 18);
      expect(yAxis.axisLabel.overflow).toBe("truncate");
    });

    it("tightens the other paddings in a narrow widget", () => {
      measured.width = 240;
      const { grid } = optionOf({ data: sampleData });
      expect(grid.right).toBe(8);
      expect(grid.top).toBe(8);
    });

    it("still reserves the slider room when compact", () => {
      measured.width = 240;
      const { grid } = optionOf({ data: sampleData });
      expect(grid.bottom).toBe(40);
    });
  });

  describe("Hastings look (#2231)", () => {
    const optionOf = (props: Parameters<typeof GanttChart>[0]) => {
      mockSetOption.mockClear();
      render(<GanttChart {...props} />);
      return mockSetOption.mock.calls[0][0];
    };
    const day = 86400000;
    const weeks = [
      { task: "Plan", start: 1700000000000, end: 1700000000000 + 5 * day },
      {
        task: "Build",
        start: 1700000000000 + day,
        end: 1700000000000 + 33 * day,
      },
    ];

    it("colours bars by the category column through the palette", () => {
      const { series } = optionOf({ data: sampleData });
      const colours = series[0].data.map(
        (d: { itemStyle?: { color: string } }) => d.itemStyle?.color,
      );
      // Design/Develop share Phase 1, Test is Phase 2; hastings light 1 and 2.
      expect(colours).toEqual(["#C47C08", "#C47C08", "#5B7290"]);
    });

    it("lets a styling rule override the category colour", () => {
      const { series } = optionOf({
        data: sampleData,
        stylingRules: [
          {
            id: "r",
            column: "category",
            operator: "==",
            value: "Phase 2",
            color: "#123456",
          },
        ],
      });
      expect(series[0].data[2].itemStyle.color).toBe("#123456");
    });

    it("ticks weekly at local midnight, over a span of weeks", () => {
      const { xAxis } = optionOf({ data: weeks });
      // From the first start's midnight, a week apart, up to the last end.
      const from = new Date(1700000000000);
      from.setHours(0, 0, 0, 0);
      const ticks = [0, 7, 14, 21, 28].map((n) => {
        const d = new Date(from);
        d.setDate(d.getDate() + n);
        return d.getTime();
      });
      expect(xAxis.axisTick.customValues).toEqual(ticks);
      expect(xAxis.axisLabel.customValues).toEqual(ticks);
      expect(xAxis.splitLine.show).toBe(true);
    });

    it("names every weekly tick as a day, even one at 09:00 or on Jan 1", () => {
      // ECharts picks a template per tick's precision: a tick off midnight
      // printed "09:00", one on Jan 1 printed "2027". A midnight tick under a
      // plain string template prints "{MMM} {d}" whatever it falls on.
      const start = new Date(2026, 11, 25, 9, 0).getTime();
      const { xAxis } = optionOf({
        data: [{ task: "A", start, end: start + 20 * day }],
      });
      expect(xAxis.axisLabel.formatter).toBe("{MMM} {d}");
      const ticks = xAxis.axisLabel.customValues as number[];
      expect(ticks.every((t) => new Date(t).getHours() === 0)).toBe(true);
      const jan1 = new Date(ticks[1]);
      expect([jan1.getMonth(), jan1.getDate()]).toEqual([0, 1]);
    });

    it("leaves tick spacing to ECharts over a span shorter than two weeks", () => {
      const { xAxis } = optionOf({ data: sampleData });
      expect(xAxis.axisTick).toBeUndefined();
      expect(xAxis.axisLabel.customValues).toBeUndefined();
    });

    it("draws the zoom slider 6px high, near the bottom edge", () => {
      const { dataZoom } = optionOf({ data: sampleData });
      const slider = dataZoom.find(
        (z: { type: string }) => z.type === "slider",
      );
      expect(slider.height).toBe(6);
      expect(slider.bottom).toBe(8);
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

    it("clips the bars to the plot — what makes weakFilter safe here", () => {
      // weakFilter keeps a bar whose far end is outside the window, and a
      // custom series is unclipped by default (echarts 6.1.0
      // CustomSeries.js `clip: false`), so the kept bar was painted across
      // the task-label gutter and past the plot's right edge.
      const { series } = optionOf({ data: sampleData });
      expect(series[0].clip).toBe(true);
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
