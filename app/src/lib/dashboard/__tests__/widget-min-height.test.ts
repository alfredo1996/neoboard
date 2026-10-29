import { describe, it, expect } from "vitest";
import { withWidgetMinHeights } from "../widget-min-height";
import type { DashboardWidget, GridLayoutItem } from "@/lib/db/schema";

const widget = (id: string, parameterType?: string): DashboardWidget =>
  ({
    id,
    chartType: "parameter-select",
    connectionId: "",
    query: "",
    params: {},
    settings: { chartOptions: parameterType ? { parameterType } : {} },
  }) as DashboardWidget;

const item = (i: string, h: number): GridLayoutItem => ({
  i,
  x: 0,
  y: 0,
  w: 3,
  h,
});

describe("withWidgetMinHeights", () => {
  it("gives a number-range selector minH 3 and raises a saved h of 2", () => {
    const [out] = withWidgetMinHeights(
      [item("a", 2)],
      [widget("a", "number-range")],
    );
    expect(out.minH).toBe(3);
    expect(out.h).toBe(3);
  });

  it("leaves a taller number-range selector alone", () => {
    const [out] = withWidgetMinHeights(
      [item("a", 5)],
      [widget("a", "number-range")],
    );
    expect(out.h).toBe(5);
  });

  it.each([["select"], ["text"], ["date"], [undefined]])(
    "gives a %s selector no minH",
    (type) => {
      const [out] = withWidgetMinHeights([item("a", 2)], [widget("a", type)]);
      expect(out.minH).toBeUndefined();
      expect(out.h).toBe(2);
    },
  );

  it("ignores non-selector widgets", () => {
    const w = { ...widget("a", "number-range"), chartType: "bar" };
    const [out] = withWidgetMinHeights([item("a", 2)], [w]);
    expect(out.minH).toBeUndefined();
  });
});
