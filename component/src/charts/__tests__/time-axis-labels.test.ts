import { describe, it, expect, vi } from "vitest";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { buildTimeAxisLabelFormatter } from "../chart-utils";

// vitest.setup.ts mocks these modules globally; this test needs the real ones.
vi.unmock("echarts/charts");
vi.unmock("echarts/components");
vi.unmock("echarts/renderers");

echarts.use([LineChart, GridComponent, SVGRenderer]);

const DAY = 864e5;

/** The labels ECharts really draws (not just formats) for a line on `points`. */
function drawnLabels(points: [number, number][]): string[] {
  const chart = echarts.init(null as never, null as never, {
    renderer: "svg",
    ssr: true,
    width: 900,
    height: 300,
  });
  chart.setOption({
    animation: false,
    xAxis: {
      type: "time",
      axisLabel: { formatter: buildTimeAxisLabelFormatter() },
    },
    yAxis: { type: "value", axisLabel: { show: false } },
    series: [{ type: "line", data: points }],
  });
  const svg = chart.renderToSVGString();
  chart.dispose();
  return [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
}

const series = (start: Date, n: number, stepMs: number) =>
  Array.from(
    { length: n },
    (_, i) => [start.getTime() + i * stepMs, i] as [number, number],
  );

describe("buildTimeAxisLabelFormatter through real ECharts (#2227)", () => {
  it("prints the first year even though ECharts formats an undrawn end tick first", () => {
    // Weekly from 2024-01-29: tick 0 is the data's own first date, never drawn.
    const labels = drawnLabels(series(new Date(2024, 0, 29), 100, 7 * DAY));
    expect(labels[0]).toMatch(/^\w{3} 2024$/);
    expect(labels.filter((l) => /2024/.test(l))).toHaveLength(1);
    expect(labels.some((l) => /^\w{3} 2025$/.test(l))).toBe(true);
  });

  it("labels a 30-day daily span with the day, not a repeated month", () => {
    const labels = drawnLabels(series(new Date(2024, 8, 15), 30, DAY));
    expect(labels.length).toBeGreaterThan(2);
    // A month boundary may carry the year; the rest are days.
    expect(
      labels.filter((l) => /^\w{3} \d{1,2}$/.test(l)).length,
    ).toBeGreaterThan(5);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("labels a 24-hour span with the time", () => {
    const labels = drawnLabels(series(new Date(2024, 8, 15), 24, 36e5));
    expect(labels.length).toBeGreaterThan(2);
    expect(
      labels.filter((l) => /^\d{2}:\d{2}$/.test(l)).length,
    ).toBeGreaterThan(3);
  });

  it("tells sub-second ticks apart with the time to the millisecond, not one repeated month", () => {
    const labels = drawnLabels(series(new Date(2024, 8, 15, 10), 50, 20));
    expect(labels.length).toBeGreaterThan(2);
    // The first tick is the minute boundary itself (10:00); the rest are ms.
    expect(
      labels.slice(1).every((l) => /^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(l)),
    ).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("labels second-spaced ticks with seconds", () => {
    const labels = drawnLabels(series(new Date(2024, 8, 15, 10), 60, 1000));
    expect(labels.slice(1).every((l) => /^\d{2}:\d{2}:\d{2}$/.test(l))).toBe(
      true,
    );
    expect(new Set(labels).size).toBe(labels.length);
  });
});
