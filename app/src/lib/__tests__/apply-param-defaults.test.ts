import { describe, it, expect } from "vitest";
import { extractParamDefaults } from "../apply-param-defaults";
import type { DashboardLayoutV2 } from "@/lib/db/schema";

function makeLayout(
  widgets: Array<{ chartType: string; chartOptions?: Record<string, unknown> }>,
): DashboardLayoutV2 {
  return {
    version: 2,
    pages: [
      {
        id: "p1",
        title: "Page 1",
        widgets: widgets.map((w, i) => ({
          id: `w${i}`,
          chartType: w.chartType,
          connectionId: "",
          query: "",
          settings: { chartOptions: w.chartOptions ?? {} },
        })),
        gridLayout: [],
      },
    ],
  };
}

describe("extractParamDefaults", () => {
  it("returns empty for layout with no parameter widgets", () => {
    const layout = makeLayout([{ chartType: "bar" }, { chartType: "table" }]);
    expect(extractParamDefaults(layout)).toEqual({});
  });

  it("extracts default value from parameter-select widget", () => {
    const layout = makeLayout([
      {
        chartType: "parameter-select",
        chartOptions: { parameterName: "year", defaultValue: "2024" },
      },
    ]);
    expect(extractParamDefaults(layout)).toEqual({ year: "2024" });
  });

  it("skips parameter widgets without defaultValue", () => {
    const layout = makeLayout([
      {
        chartType: "parameter-select",
        chartOptions: { parameterName: "dept" },
      },
    ]);
    expect(extractParamDefaults(layout)).toEqual({});
  });

  it("skips parameter widgets with empty defaultValue", () => {
    const layout = makeLayout([
      {
        chartType: "parameter-select",
        chartOptions: { parameterName: "dept", defaultValue: "" },
      },
    ]);
    expect(extractParamDefaults(layout)).toEqual({});
  });

  it("extracts defaults from multiple pages", () => {
    const layout: DashboardLayoutV2 = {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "P1",
          gridLayout: [],
          widgets: [
            {
              id: "w1",
              chartType: "parameter-select",
              connectionId: "",
              query: "",
              settings: {
                chartOptions: { parameterName: "year", defaultValue: "2024" },
              },
            },
          ],
        },
        {
          id: "p2",
          title: "P2",
          gridLayout: [],
          widgets: [
            {
              id: "w2",
              chartType: "parameter-select",
              connectionId: "",
              query: "",
              settings: {
                chartOptions: { parameterName: "dept", defaultValue: "Sales" },
              },
            },
          ],
        },
      ],
    };
    expect(extractParamDefaults(layout)).toEqual({
      year: "2024",
      dept: "Sales",
    });
  });
});
