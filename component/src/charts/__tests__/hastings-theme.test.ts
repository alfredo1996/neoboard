// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { BarChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
// vitest.setup.ts stubs these modules for every test; the seam needs the real ones.
vi.unmock("echarts/charts");
vi.unmock("echarts/components");
vi.unmock("echarts/renderers");

import { registerNeoboardThemes, THEME_LIGHT, THEME_DARK } from "../theme";
import { COLOR_PALETTES, getPaletteColors } from "../palettes";
import {
  formatNumber,
  resolveShowLegend,
  buildCategoryAxisLabel,
  legendIsolateAction,
  highlight,
} from "../chart-utils";

echarts.use([SVGRenderer, BarChart, GridComponent]);
registerNeoboardThemes(echarts.registerTheme);

// Hexes copied from the issue's "Chart theme" table, not from the code.
const LIGHT = [
  "#C47C08",
  "#5B7290",
  "#5E8C6A",
  "#B4674A",
  "#8A6A8F",
  "#4E8A8C",
  "#A89060",
  "#8A93A3",
];
const DARK = [
  "#F2A93B",
  "#8AA3C2",
  "#8DBB98",
  "#D99277",
  "#B497B9",
  "#7FB8BA",
  "#CDB487",
  "#A7AFBD",
];

// ECharts theme objects are untyped
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const themes: Record<string, Record<string, any>> = {};
registerNeoboardThemes((name, t) => {
  themes[name] = t;
});

describe("hastings palette", () => {
  it("is registered, in order, per theme", () => {
    expect(themes[THEME_LIGHT].color).toEqual(LIGHT);
    expect(themes[THEME_DARK].color).toEqual(DARK);
  });

  it("is the selectable 'hastings' palette (light order) next to the old ones", () => {
    expect(getPaletteColors("hastings")).toEqual(LIGHT);
    expect(Object.keys(COLOR_PALETTES)).toContain("citrine");
    expect(Object.keys(COLOR_PALETTES)).toContain("tableau");
  });

  it("paints the first two bar series in palette order through ECharts", () => {
    const chart = echarts.init(null, THEME_DARK, {
      renderer: "svg",
      ssr: true,
      width: 200,
      height: 100,
    });
    chart.setOption({
      animation: false,
      xAxis: { type: "category", data: ["a"] },
      yAxis: {},
      series: [
        { type: "bar", data: [1] },
        { type: "bar", data: [2] },
      ],
    });
    const svg = chart.renderToSVGString();
    chart.dispose();
    expect(svg.indexOf(DARK[0])).toBeGreaterThan(-1);
    expect(svg.indexOf(DARK[1])).toBeGreaterThan(svg.indexOf(DARK[0]));
  });
});

describe("axes", () => {
  it.each([
    [THEME_LIGHT, "#686E7A", "#E4E6EA"],
    [THEME_DARK, "#959BA6", "#262A31"],
  ])(
    "%s: no value-axis line or ticks, hairline grid, 11px ink-3 Plex labels",
    (name, ink3, rule) => {
      const v = themes[name].valueAxis;
      expect(v.axisLine.show).toBe(false);
      expect(v.axisTick.show).toBe(false);
      expect(v.splitLine.lineStyle).toMatchObject({ color: rule, width: 1 });
      expect(v.axisLabel).toMatchObject({
        fontSize: 11,
        color: ink3,
        fontFamily: expect.stringContaining("IBM Plex Sans"),
      });
      expect(themes[name].categoryAxis.axisLabel).toMatchObject({
        fontSize: 11,
        color: ink3,
      });
    },
  );

  it("chart text is IBM Plex Sans", () => {
    expect(themes[THEME_LIGHT].textStyle.fontFamily).toMatch(
      /^"IBM Plex Sans"/,
    );
  });

  it("legend: 8px squares, left-aligned", () => {
    expect(themes[THEME_LIGHT].legend).toMatchObject({
      itemWidth: 8,
      itemHeight: 8,
      icon: "rect",
      left: 0,
    });
  });

  it("legend paging arrows take ink 3, not ECharts' stock blue", () => {
    expect(themes[THEME_LIGHT].legend.pageIconColor).toBe("#686E7A");
    expect(themes[THEME_DARK].legend.pageIconColor).toBe("#959BA6");
  });
});

describe("legend", () => {
  it.each([
    [true, 1, false],
    [true, 2, true],
    [undefined, 2, true],
    [undefined, 1, false],
    [false, 3, false],
  ])("showLegend=%s with %i series -> %s", (show, n, want) => {
    expect(resolveShowLegend(show, n, false)).toBe(want);
  });

  it("clicking an entry of an all-selected legend isolates it; again restores all", () => {
    // ECharts has already toggled the clicked entry when this fires.
    expect(legendIsolateAction({ a: false, b: true, c: true }, "a")).toBe(
      "legendInverseSelect",
    );
    expect(legendIsolateAction({ a: false, b: false, c: false }, "a")).toBe(
      "legendAllSelect",
    );
    expect(legendIsolateAction({ a: true, b: true, c: false }, "a")).toBeNull();
    expect(
      legendIsolateAction({ a: false, b: true, c: false }, "a"),
    ).toBeNull();
  });
});

describe("formatNumber by context", () => {
  it.each([
    ["axis", 879283, "879K"],
    ["axis", 1.5e6, "1.5M"],
    ["tooltip", 879282.72, "879,282.72"],
    ["tooltip", 1500, "1,500"],
    ["tooltip", 1500.1, "1,500.1"],
    ["label", 879283, "879K"],
    ["label", 12.3456, "12.3"],
  ] as const)("%s %d -> %s", (context, v, want) => {
    expect(formatNumber(v, { context })).toBe(want);
  });

  it.each(["axis", "tooltip", "label"] as const)(
    "%s: null and undefined are an em dash",
    (context) => {
      expect(formatNumber(null, { context })).toBe("—");
      expect(formatNumber(undefined, { context })).toBe("—");
    },
  );

  it("percent is one decimal when the author set no precision", () => {
    expect(
      formatNumber(0.20056, { context: "tooltip", numberFormat: "percent" }),
    ).toBe("20.1%");
  });

  it.each(["axis", "tooltip", "label"] as const)(
    "%s: the author's format wins",
    (context) => {
      expect(formatNumber(879282.72, { context, decimalPlaces: 0 })).toBe(
        "879,283",
      );
      expect(formatNumber(879282.72, { context, numberFormat: "plain" })).toBe(
        "879282.72",
      );
      expect(
        formatNumber(879283, {
          context,
          decimalPlaces: 1,
          prefix: "$",
          suffix: "k",
        }),
      ).toBe("$879,283.0k");
    },
  );

  it("prefix and suffix wrap the context default too", () => {
    expect(formatNumber(879283, { context: "axis", prefix: "$" })).toBe(
      "$879K",
    );
  });

  it("without a context, the #911 default (comma, 2dp) is unchanged", () => {
    expect(formatNumber(1500)).toBe("1,500.00");
  });
});

describe("category axis labels", () => {
  it("auto (-1 or unset) never rotates, however crowded", () => {
    expect(buildCategoryAxisLabel(30, { containerWidth: 300 }).rotate).toBe(0);
    expect(
      buildCategoryAxisLabel(30, { containerWidth: 300, rotateOverride: -1 })
        .rotate,
    ).toBe(0);
  });

  it("an explicit angle is kept", () => {
    expect(
      buildCategoryAxisLabel(30, { containerWidth: 300, rotateOverride: 45 })
        .rotate,
    ).toBe(45);
  });

  it("a crowded axis skips labels instead of overlapping", () => {
    expect(buildCategoryAxisLabel(30, { containerWidth: 300 })).toMatchObject({
      hideOverlap: true,
    });
  });
});

describe("highlight", () => {
  const data = [
    { name: "a", value: 1, itemStyle: { color: "#111111" } },
    { name: "b", value: 2 },
    { name: "c", value: 3 },
  ];

  it("greys everything not selected and leaves the selected one untouched", () => {
    const out = highlight(data, ["b"], false);
    expect(out[1]).toEqual(data[1]);
    expect(out[0].itemStyle?.color).toBe("#C3C9D2");
    expect(out[2].itemStyle?.color).toBe("#C3C9D2");
    expect(out[0].value).toBe(1);
  });

  it("uses the dark soft grey in dark mode", () => {
    expect(highlight(data, ["b"], true)[2].itemStyle?.color).toBe("#4A515C");
  });

  it("nothing selected means nothing greyed", () => {
    expect(highlight(data, [], false)).toEqual(data);
    expect(highlight(data, undefined, false)).toEqual(data);
  });

  it("does not mutate its input", () => {
    highlight(data, ["b"], false);
    expect(data[0].itemStyle?.color).toBe("#111111");
  });
});
