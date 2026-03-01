import { describe, it, expect } from "vitest";
import { collectParameterNames } from "../collect-parameter-names";
import type { DashboardLayoutV2 } from "../db/schema";

function makeLayout(pages: DashboardLayoutV2["pages"]): DashboardLayoutV2 {
  return { version: 2, pages };
}

describe("collectParameterNames", () => {
  it("returns empty array for empty layout", () => {
    const layout = makeLayout([]);
    expect(collectParameterNames(layout)).toEqual([]);
  });

  it("returns empty array for page with no widgets", () => {
    const layout = makeLayout([
      { id: "p1", title: "Page 1", widgets: [], gridLayout: [] },
    ]);
    expect(collectParameterNames(layout)).toEqual([]);
  });

  it("extracts parameterName from click action parameterMapping", () => {
    const layout = makeLayout([
      {
        id: "p1",
        title: "Page 1",
        widgets: [
          {
            id: "w1",
            chartType: "bar",
            connectionId: "c1",
            query: "RETURN 1",
            settings: {
              clickAction: {
                type: "set-parameter",
                parameterMapping: { parameterName: "selectedMovie", sourceField: "name" },
              },
            },
          },
        ],
        gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
      },
    ]);
    expect(collectParameterNames(layout)).toEqual(["selectedMovie"]);
  });

  it("extracts $param_xxx references from widget queries", () => {
    const layout = makeLayout([
      {
        id: "p1",
        title: "Page 1",
        widgets: [
          {
            id: "w1",
            chartType: "table",
            connectionId: "c1",
            query: "SELECT * FROM users WHERE name = $param_selectedName AND dept = $param_dept",
            settings: {},
          },
        ],
        gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
      },
    ]);
    expect(collectParameterNames(layout)).toEqual(["dept", "selectedName"]);
  });

  it("extracts parameterName from param-select widget chartOptions", () => {
    const layout = makeLayout([
      {
        id: "p1",
        title: "Page 1",
        widgets: [
          {
            id: "w1",
            chartType: "parameter-select",
            connectionId: "c1",
            query: "",
            settings: {
              chartOptions: { parameterName: "region" },
            },
          },
        ],
        gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
      },
    ]);
    expect(collectParameterNames(layout)).toEqual(["region"]);
  });

  it("deduplicates and sorts names from multiple sources", () => {
    const layout = makeLayout([
      {
        id: "p1",
        title: "Page 1",
        widgets: [
          {
            id: "w1",
            chartType: "bar",
            connectionId: "c1",
            query: "MATCH (n) WHERE n.name = $param_dept RETURN n",
            settings: {
              clickAction: {
                type: "set-parameter",
                parameterMapping: { parameterName: "dept", sourceField: "department" },
              },
            },
          },
          {
            id: "w2",
            chartType: "parameter-select",
            connectionId: "c1",
            query: "",
            settings: {
              chartOptions: { parameterName: "dept" },
            },
          },
          {
            id: "w3",
            chartType: "table",
            connectionId: "c1",
            query: "SELECT * FROM t WHERE x = $param_alpha",
            settings: {},
          },
        ],
        gridLayout: [
          { i: "w1", x: 0, y: 0, w: 4, h: 3 },
          { i: "w2", x: 4, y: 0, w: 4, h: 3 },
          { i: "w3", x: 8, y: 0, w: 4, h: 3 },
        ],
      },
    ]);
    expect(collectParameterNames(layout)).toEqual(["alpha", "dept"]);
  });

  it("scans across multiple pages", () => {
    const layout = makeLayout([
      {
        id: "p1",
        title: "Page 1",
        widgets: [
          {
            id: "w1",
            chartType: "bar",
            connectionId: "c1",
            query: "RETURN $param_foo",
            settings: {},
          },
        ],
        gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
      },
      {
        id: "p2",
        title: "Page 2",
        widgets: [
          {
            id: "w2",
            chartType: "table",
            connectionId: "c1",
            query: "SELECT $param_bar",
            settings: {},
          },
        ],
        gridLayout: [{ i: "w2", x: 0, y: 0, w: 4, h: 3 }],
      },
    ]);
    expect(collectParameterNames(layout)).toEqual(["bar", "foo"]);
  });
});
