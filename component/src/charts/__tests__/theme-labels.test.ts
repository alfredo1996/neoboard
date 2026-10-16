// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import {
  BarChart,
  LineChart,
  PieChart,
  RadarChart,
  SankeyChart,
} from "echarts/charts";
import {
  MarkLineComponent,
  RadarComponent,
  GridComponent,
} from "echarts/components";
// vitest.setup.ts stubs these modules for every test; this one needs the real ones.
vi.unmock("echarts/charts");
vi.unmock("echarts/components");
vi.unmock("echarts/renderers");

import { registerNeoboardThemes } from "../theme";

echarts.use([
  SVGRenderer,
  BarChart,
  LineChart,
  PieChart,
  RadarChart,
  SankeyChart,
  MarkLineComponent,
  RadarComponent,
  GridComponent,
]);
registerNeoboardThemes(echarts.registerTheme);

/**
 * #2212 — labels that sit on the canvas must take the theme foreground with
 * no halo. Rendered through ECharts' own theme merge (SSR SVG), so a broken
 * merge or an un-themed label path shows up, not just a theme-object typo.
 */
const FOREGROUND = { "neoboard-light": "#14161a", "neoboard-dark": "#f3f4f6" };

const xy = { xAxis: { type: "category", data: ["a", "b"] }, yAxis: {} };
// [name, marker text the label renders, option]
const cases: Array<[string, string, Record<string, unknown>]> = [
  [
    "bar values",
    "BARV",
    {
      ...xy,
      series: [
        {
          type: "bar",
          data: [1, 2],
          label: { show: true, formatter: "BARV" },
        },
      ],
    },
  ],
  [
    "pie slices",
    "PIEV",
    {
      series: [
        {
          type: "pie",
          data: [{ name: "a", value: 1 }],
          label: { formatter: "PIEV" },
        },
      ],
    },
  ],
  [
    "sankey nodes",
    "SANK_A",
    {
      series: [
        {
          type: "sankey",
          data: [{ name: "SANK_A" }, { name: "SANK_B" }],
          links: [{ source: "SANK_A", target: "SANK_B", value: 1 }],
        },
      ],
    },
  ],
  [
    "radar values",
    "RADV",
    {
      radar: {
        indicator: [
          { name: "i1", max: 5 },
          { name: "i2", max: 5 },
          { name: "i3", max: 5 },
        ],
      },
      series: [
        {
          type: "radar",
          data: [
            { value: [1, 2, 3], label: { show: true, formatter: "RADV" } },
          ],
        },
      ],
    },
  ],
  [
    "line endLabel",
    "ENDLBL",
    {
      ...xy,
      series: [
        {
          type: "line",
          data: [1, 2],
          endLabel: { show: true, formatter: "ENDLBL" },
        },
      ],
    },
  ],
  [
    "markLine label",
    "REFLBL",
    {
      ...xy,
      series: [
        {
          type: "line",
          data: [1, 2],
          markLine: { data: [{ yAxis: 1, label: { formatter: "REFLBL" } }] },
        },
      ],
    },
  ],
];

describe.each(Object.entries(FOREGROUND))(
  "%s label defaults (#2212)",
  (theme, fg) => {
    it.each(cases)("%s: foreground fill, no halo", (_name, marker, option) => {
      const chart = echarts.init(null, theme, {
        renderer: "svg",
        ssr: true,
        width: 400,
        height: 300,
      });
      chart.setOption({ animation: false, ...option });
      const svg = chart.renderToSVGString();
      chart.dispose();
      // The label under test is the <text> that renders the marker. Absent,
      // muted or haloed labels all fail here; axis ticks cannot satisfy it.
      const tag = new RegExp(`<text [^>]*>${marker}<`).exec(svg)?.[0];
      expect(tag).toBeDefined();
      expect(tag).toContain(`fill="${fg}"`);
      expect(tag).not.toContain("stroke=");
    });
  },
);
