import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GanttChart } from "../gantt-chart";
import { registerNeoboardThemes, TODAY_LINE_COLOR } from "../theme";

/**
 * dataZoom styling belongs to the theme, not to a chart (#1273).
 *
 * The gantt's slider rendered in ECharts' stock lavender-blue in both themes —
 * the only off-palette element in the library, sitting directly under a
 * citrine chart. Same shape of rule as the gridlines in #1247: a chart that
 * styles its own zoom control makes two widgets on one dashboard look like
 * they came from different products.
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
  const format = { encodeHTML: (s: string) => String(s) };
  return {
    use,
    init,
    registerTheme,
    format,
    default: { use, init, registerTheme, format },
  };
});

/** Every colour key a chart could use to override the themed slider. */
const COLOUR_KEYS = [
  "backgroundColor",
  "borderColor",
  "fillerColor",
  "handleStyle",
  "moveHandleStyle",
  "dataBackground",
  "selectedDataBackground",
  "textStyle",
] as const;

const ganttData = [
  { task: "Design", start: 1700000000000, end: 1700500000000 },
  { task: "Build", start: 1700500000000, end: 1701000000000 },
];

/** Enough tasks to bring out the vertical slider as well. */
const manyTasks = Array.from({ length: 20 }, (_, i) => ({
  task: `Task ${i}`,
  start: 1700000000000 + i * 1000,
  end: 1700500000000 + i * 1000,
}));

const zoomsOf = (ui: React.ReactElement) => {
  render(ui);
  const opts = mockSetOption.mock.calls[0][0] as {
    dataZoom?: Record<string, unknown>[];
  };
  return opts.dataZoom ?? [];
};

describe("dataZoom styling comes from the theme (#1273)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    size.width = 600;
    size.height = 400;
  });

  it.each([
    ["gantt", <GanttChart key="g" data={ganttData} />],
    ["gantt with a vertical slider", <GanttChart key="v" data={manyTasks} />],
  ])("%s declares no dataZoom colour of its own", (_name, ui) => {
    const zooms = zoomsOf(ui);
    expect(zooms.length).toBeGreaterThan(0);
    for (const zoom of zooms) {
      for (const key of COLOUR_KEYS) {
        expect(zoom).not.toHaveProperty(key);
      }
    }
  });

  it.each(["neoboard-light", "neoboard-dark"] as const)(
    "%s registers the slider's colours",
    (name) => {
      const themes: Record<string, Record<string, unknown>> = {};
      registerNeoboardThemes((themeName, theme) => {
        themes[themeName] = theme;
      });
      const zoom = themes[name].dataZoom as Record<string, unknown>;
      expect(zoom).toBeDefined();
      // The selected window and its handles carry the interaction colour;
      // everything else is the quiet track.
      expect(zoom.fillerColor).toBeTruthy();
      expect(zoom.handleStyle).toBeTruthy();
      expect(zoom.dataBackground).toBeTruthy();
    },
  );
});

describe("the today marker is a reference, not a status (#1273)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.classList.remove("dark");
  });

  const todayMarkLine = () => {
    const series = mockSetOption.mock.calls[0][0].series as Record<
      string,
      unknown
    >[];
    return (
      series.find((s) => s.markLine) as {
        markLine: { lineStyle: { color: string }; label: { color?: string } };
      }
    ).markLine;
  };

  it("does not draw the today line in the destructive red", () => {
    render(<GanttChart data={ganttData} showTodayLine />);
    const markLine = todayMarkLine();
    expect(markLine.lineStyle.color).toBe(TODAY_LINE_COLOR.light);
    // The label inherited the line colour, so it went red along with it.
    expect(markLine.label.color).toBe(TODAY_LINE_COLOR.light);
  });

  it("takes the dark mirror on a dark page", () => {
    document.documentElement.classList.add("dark");
    render(<GanttChart data={ganttData} showTodayLine />);
    const markLine = todayMarkLine();
    expect(markLine.lineStyle.color).toBe(TODAY_LINE_COLOR.dark);
    expect(markLine.label.color).toBe(TODAY_LINE_COLOR.dark);
  });
});
