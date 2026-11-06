import { describe, it, expect, vi } from "vitest";
import * as echarts from "echarts";
import { defaultCursorUnlessClickable } from "../chart-utils";

echarts.registerMap("sq", {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "A" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [0, 10],
            [10, 10],
            [10, 0],
            [0, 0],
          ],
        ],
      },
    },
  ],
} as never);

type Handler = (e: unknown) => void;

/** A stand-in chart that records what the helper hooks onto. */
function fakeChart() {
  const zrHandlers: Handler[] = [];
  const chartHandlers: Handler[] = [];
  const setCursorStyle = vi.fn();
  const chart = {
    on: (_n: string, h: Handler) => chartHandlers.push(h),
    off: vi.fn(),
    getZr: () => ({
      on: (_n: string, h: Handler) => zrHandlers.push(h),
      off: vi.fn(),
      setCursorStyle,
    }),
  };
  defaultCursorUnlessClickable(chart);
  return {
    setCursorStyle,
    chartMove: (p: unknown) => chartHandlers.forEach((h) => h(p)),
    zrMove: (target: unknown) => zrHandlers.forEach((h) => h({ target })),
  };
}

/** Every visible mark ECharts would draw for these options. */
function marks(option: echarts.EChartsOption) {
  const c = echarts.init(null as never, undefined, {
    renderer: "svg",
    ssr: true,
    width: 400,
    height: 300,
  });
  c.setOption({ animation: false, ...option });
  const list = c
    .getZr()
    .storage.getDisplayList(true)
    .filter((e) => !e.silent && !e.ignore);
  c.dispose();
  return list;
}

const xy = {
  xAxis: { type: "category", data: ["a", "b"] },
  yAxis: {},
} as const;

describe("defaultCursorUnlessClickable (#2406)", () => {
  // Each of these kept zrender's pointer even with `series.cursor` set.
  it.each([
    [
      "line area and stroke",
      { ...xy, series: [{ type: "line", areaStyle: {}, data: [1, 2] }] },
    ],
    ["gauge pointer", { series: [{ type: "gauge", data: [{ value: 40 }] }] }],
    [
      "pie labels",
      {
        series: [
          {
            type: "pie",
            data: [
              { name: "a", value: 1 },
              { name: "b", value: 2 },
            ],
          },
        ],
      },
    ],
    [
      "map regions",
      { series: [{ type: "map", map: "sq", data: [{ name: "A", value: 1 }] }] },
    ],
  ] as [string, echarts.EChartsOption][])(
    "no hand over %s",
    (_name, option) => {
      const pointers = marks(option).filter((e) => e.cursor === "pointer");
      expect(pointers.length).toBeGreaterThan(0);
      for (const el of pointers) {
        const { setCursorStyle, zrMove } = fakeChart();
        zrMove(el);
        expect(setCursorStyle).toHaveBeenCalledWith("default");
      }
    },
  );

  it("keeps the hand over a legend item", () => {
    const { setCursorStyle, chartMove, zrMove } = fakeChart();
    chartMove({ componentType: "legend" });
    zrMove({ cursor: "pointer" });
    expect(setCursorStyle).not.toHaveBeenCalled();
  });

  it("keeps the hand over a treemap node, which zooms on click", () => {
    const { setCursorStyle, chartMove, zrMove } = fakeChart();
    chartMove({ componentType: "series", seriesType: "treemap" });
    zrMove({ cursor: "pointer" });
    expect(setCursorStyle).not.toHaveBeenCalled();
  });

  it("leaves a cursor an element names itself, such as a slider handle", () => {
    const { setCursorStyle, zrMove } = fakeChart();
    zrMove({ cursor: "ew-resize" });
    expect(setCursorStyle).not.toHaveBeenCalled();
  });

  it("forgets a legend hover once the pointer moves elsewhere", () => {
    const { setCursorStyle, chartMove, zrMove } = fakeChart();
    chartMove({ componentType: "legend" });
    zrMove({ cursor: "pointer" });
    zrMove({ cursor: "pointer" });
    expect(setCursorStyle).toHaveBeenCalledTimes(1);
  });
});
