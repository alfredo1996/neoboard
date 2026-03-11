import { describe, it, expect } from "vitest";
import { collectParameterNames, findParameterCollisions, getWidgetParameterNames, aggregateClickActionParamNames } from "../collect-parameter-names";
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

describe("findParameterCollisions", () => {
  it("returns empty array when no other widget uses the parameter name", () => {
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
            settings: { chartOptions: { parameterName: "region" } },
          },
        ],
        gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
      },
    ]);
    expect(findParameterCollisions(layout, "w1", "region")).toEqual([]);
  });

  it("returns empty array when parameterName is empty string", () => {
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
            settings: { chartOptions: { parameterName: "region" } },
          },
        ],
        gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
      },
    ]);
    expect(findParameterCollisions(layout, "w1", "")).toEqual([]);
  });

  it("detects collision with another param-select widget sharing the same name", () => {
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
            settings: { chartOptions: { parameterName: "region" } },
          },
          {
            id: "w2",
            chartType: "parameter-select",
            connectionId: "c1",
            query: "",
            settings: {
              title: "Region Picker",
              chartOptions: { parameterName: "region" },
            },
          },
        ],
        gridLayout: [
          { i: "w1", x: 0, y: 0, w: 4, h: 3 },
          { i: "w2", x: 4, y: 0, w: 4, h: 3 },
        ],
      },
    ]);
    expect(findParameterCollisions(layout, "w1", "region")).toEqual([
      { widgetId: "w2", title: "Region Picker" },
    ]);
  });

  it("detects collision with a click-action parameterMapping sharing the same name", () => {
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
            settings: { chartOptions: { parameterName: "dept" } },
          },
          {
            id: "w2",
            chartType: "bar",
            connectionId: "c1",
            query: "RETURN 1",
            settings: {
              title: "Department Bar",
              clickAction: {
                type: "set-parameter",
                parameterMapping: { parameterName: "dept", sourceField: "name" },
              },
            },
          },
        ],
        gridLayout: [
          { i: "w1", x: 0, y: 0, w: 4, h: 3 },
          { i: "w2", x: 4, y: 0, w: 4, h: 3 },
        ],
      },
    ]);
    expect(findParameterCollisions(layout, "w1", "dept")).toEqual([
      { widgetId: "w2", title: "Department Bar" },
    ]);
  });

  it("detects collision from a click-action rule sharing the same name", () => {
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
            settings: { chartOptions: { parameterName: "movie" } },
          },
          {
            id: "w2",
            chartType: "bar",
            connectionId: "c1",
            query: "RETURN 1",
            settings: {
              title: "Movie Bar",
              clickAction: {
                type: "set-parameter",
                rules: [
                  {
                    id: "r1",
                    type: "set-parameter",
                    parameterMapping: { parameterName: "movie", sourceField: "title" },
                  },
                ],
              },
            },
          },
        ],
        gridLayout: [
          { i: "w1", x: 0, y: 0, w: 4, h: 3 },
          { i: "w2", x: 4, y: 0, w: 4, h: 3 },
        ],
      },
    ]);
    expect(findParameterCollisions(layout, "w1", "movie")).toEqual([
      { widgetId: "w2", title: "Movie Bar" },
    ]);
  });

  it("returns multiple collisions when several widgets share the same name", () => {
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
            settings: { chartOptions: { parameterName: "region" } },
          },
          {
            id: "w2",
            chartType: "parameter-select",
            connectionId: "c1",
            query: "",
            settings: {
              title: "Region A",
              chartOptions: { parameterName: "region" },
            },
          },
          {
            id: "w3",
            chartType: "bar",
            connectionId: "c1",
            query: "RETURN 1",
            settings: {
              title: "Region Bar",
              clickAction: {
                type: "set-parameter",
                parameterMapping: { parameterName: "region", sourceField: "r" },
              },
            },
          },
        ],
        gridLayout: [
          { i: "w1", x: 0, y: 0, w: 4, h: 3 },
          { i: "w2", x: 4, y: 0, w: 4, h: 3 },
          { i: "w3", x: 8, y: 0, w: 4, h: 3 },
        ],
      },
    ]);
    const result = findParameterCollisions(layout, "w1", "region");
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.widgetId).sort()).toEqual(["w2", "w3"]);
  });

  it("excludes the current widget from collision results", () => {
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
            settings: { chartOptions: { parameterName: "selected" } },
          },
        ],
        gridLayout: [{ i: "w1", x: 0, y: 0, w: 4, h: 3 }],
      },
    ]);
    expect(findParameterCollisions(layout, "w1", "selected")).toEqual([]);
  });

  it("detects collisions across multiple pages", () => {
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
            settings: { chartOptions: { parameterName: "user" } },
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
            chartType: "parameter-select",
            connectionId: "c1",
            query: "",
            settings: {
              title: "User Picker 2",
              chartOptions: { parameterName: "user" },
            },
          },
        ],
        gridLayout: [{ i: "w2", x: 0, y: 0, w: 4, h: 3 }],
      },
    ]);
    expect(findParameterCollisions(layout, "w1", "user")).toEqual([
      { widgetId: "w2", title: "User Picker 2" },
    ]);
  });
});

describe("getWidgetParameterNames", () => {
  it("returns empty array for widget with no click action or param-select", () => {
    expect(getWidgetParameterNames({
      id: "w1", chartType: "bar", connectionId: "c1", query: "RETURN 1", settings: {},
    })).toEqual([]);
  });

  it("extracts parameterName from click action top-level parameterMapping", () => {
    expect(getWidgetParameterNames({
      id: "w1", chartType: "bar", connectionId: "c1", query: "RETURN 1",
      settings: {
        clickAction: { type: "set-parameter", parameterMapping: { parameterName: "foo", sourceField: "x" } },
      },
    })).toEqual(["foo"]);
  });

  it("extracts parameterName from click action rules", () => {
    expect(getWidgetParameterNames({
      id: "w1", chartType: "bar", connectionId: "c1", query: "RETURN 1",
      settings: {
        clickAction: {
          type: "set-parameter",
          rules: [
            { id: "r1", type: "set-parameter", parameterMapping: { parameterName: "a", sourceField: "x" } },
            { id: "r2", type: "set-parameter", parameterMapping: { parameterName: "b", sourceField: "y" } },
          ],
        },
      },
    })).toEqual(["a", "b"]);
  });

  it("extracts parameterName from param-select chartOptions", () => {
    expect(getWidgetParameterNames({
      id: "w1", chartType: "parameter-select", connectionId: "c1", query: "",
      settings: { chartOptions: { parameterName: "region" } },
    })).toEqual(["region"]);
  });

  it("does not extract param-select name from non-param-select chart type", () => {
    expect(getWidgetParameterNames({
      id: "w1", chartType: "bar", connectionId: "c1", query: "",
      settings: { chartOptions: { parameterName: "region" } },
    })).toEqual([]);
  });

  it("collects from both click action and rules", () => {
    const result = getWidgetParameterNames({
      id: "w1", chartType: "bar", connectionId: "c1", query: "RETURN 1",
      settings: {
        clickAction: {
          type: "set-parameter",
          parameterMapping: { parameterName: "top", sourceField: "x" },
          rules: [
            { id: "r1", type: "set-parameter", parameterMapping: { parameterName: "ruleParam", sourceField: "y" } },
          ],
        },
      },
    });
    expect(result).toEqual(["top", "ruleParam"]);
  });
});

describe("aggregateClickActionParamNames", () => {
  it("returns empty array when click action is disabled", () => {
    expect(aggregateClickActionParamNames(false, "foo", [])).toEqual([]);
  });

  it("returns top-level parameter name when set", () => {
    expect(aggregateClickActionParamNames(true, "selected", [])).toEqual(["selected"]);
  });

  it("trims whitespace from top-level parameter name", () => {
    expect(aggregateClickActionParamNames(true, "  name  ", [])).toEqual(["name"]);
  });

  it("skips empty top-level parameter name", () => {
    expect(aggregateClickActionParamNames(true, "", [
      { parameterMapping: { parameterName: "fromRule" } },
    ])).toEqual(["fromRule"]);
  });

  it("collects from rules", () => {
    expect(aggregateClickActionParamNames(true, "", [
      { parameterMapping: { parameterName: "a" } },
      { parameterMapping: { parameterName: "b" } },
    ])).toEqual(["a", "b"]);
  });

  it("deduplicates names", () => {
    expect(aggregateClickActionParamNames(true, "dup", [
      { parameterMapping: { parameterName: "dup" } },
      { parameterMapping: { parameterName: "other" } },
    ])).toEqual(["dup", "other"]);
  });

  it("handles rules without parameterMapping", () => {
    expect(aggregateClickActionParamNames(true, "top", [
      { parameterMapping: undefined },
      { parameterMapping: { parameterName: "rule1" } },
    ])).toEqual(["top", "rule1"]);
  });
});
