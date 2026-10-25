import { describe, it, expect } from "vitest";
import { buildTimeAxisLabelFormatter } from "../chart-utils";

// Local-time dates, as ECharts' time axis uses.
const tick = (y: number, m: number) => new Date(y, m, 1).getTime();

const render = (formatter: (v: number, i: number) => string, ticks: number[]) =>
  ticks.map((t, i) => formatter(t, i));

describe("buildTimeAxisLabelFormatter (#2227)", () => {
  it("prints the year once, on the first tick of each year, not on January", () => {
    const f = buildTimeAxisLabelFormatter();
    // Quarterly ticks starting in April: no January tick in 2024.
    const out = render(f, [
      tick(2024, 3),
      tick(2024, 6),
      tick(2024, 9),
      tick(2025, 0),
      tick(2025, 3),
    ]);
    expect(out).toEqual(["Apr 2024", "Jul", "Oct", "Jan 2025", "Apr"]);
  });

  it("starts over on every render pass (index 0 prints the year again)", () => {
    const f = buildTimeAxisLabelFormatter();
    const ticks = [tick(2024, 0), tick(2024, 3)];
    expect(render(f, ticks)).toEqual(["Jan 2024", "Apr"]);
    expect(render(f, ticks)).toEqual(["Jan 2024", "Apr"]);
  });
});
