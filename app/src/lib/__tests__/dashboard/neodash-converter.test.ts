import { describe, it, expect } from "vitest";
import {
  isNeoDashFormat,
  convertNeoDash,
  convertNeoDashWithNotes,
} from "@/lib/dashboard/neodash-converter";

const NEODASH_SIMPLE = {
  title: "My NeoDash Dashboard",
  version: "2.4",
  pages: [
    {
      title: "Page 1",
      reports: [
        {
          id: "r1",
          title: "Users Table",
          type: "table",
          query: "MATCH (u:User) RETURN u.name",
          x: 0,
          y: 0,
          width: 6,
          height: 4,
          settings: {},
          parameters: {},
        },
        {
          id: "r2",
          title: "Bar Chart",
          type: "bar",
          query: "MATCH (n) RETURN n.label, count(*)",
          x: 6,
          y: 0,
          width: 6,
          height: 4,
          settings: {},
          parameters: {},
        },
      ],
    },
  ],
};

const NEOBOARD_FORMAT = {
  formatVersion: 1,
  exportedAt: "2024-01-01T00:00:00.000Z",
  dashboard: { name: "NeoBoard Dashboard", description: null },
  connections: {},
  layout: { version: 2, pages: [] },
};

describe("isNeoDashFormat", () => {
  it("returns true for NeoDash format (has pages[0].reports)", () => {
    expect(isNeoDashFormat(NEODASH_SIMPLE)).toBe(true);
  });

  it("returns false for NeoBoard export format", () => {
    expect(isNeoDashFormat(NEOBOARD_FORMAT)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isNeoDashFormat(null)).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(isNeoDashFormat({})).toBe(false);
  });

  it("returns false when pages is empty array", () => {
    expect(isNeoDashFormat({ pages: [] })).toBe(false);
  });

  it("returns false when pages[0] has no reports", () => {
    expect(isNeoDashFormat({ pages: [{ title: "P1" }] })).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isNeoDashFormat("not an object")).toBe(false);
  });

  it("returns false when a later page has no reports (validates ALL pages)", () => {
    expect(
      isNeoDashFormat({
        pages: [
          { title: "P1", reports: [] },
          { title: "P2" }, // missing reports
        ],
      }),
    ).toBe(false);
  });

  it("returns false when a page is null", () => {
    expect(isNeoDashFormat({ pages: [null] })).toBe(false);
  });

  it("returns false when a page is an array", () => {
    expect(isNeoDashFormat({ pages: [[]] })).toBe(false);
  });

  it("returns true for multi-page NeoDash with all pages having reports", () => {
    expect(
      isNeoDashFormat({
        pages: [
          { title: "P1", reports: [{ id: "r1", type: "table", query: "q" }] },
          { title: "P2", reports: [] },
        ],
      }),
    ).toBe(true);
  });
});

/** Helper: create a single-report NeoDash fixture with overrides. */
function makeNeoDash(overrides: Record<string, unknown> = {}) {
  const defaults = {
    title: "W",
    type: "table",
    query: "q",
    x: 0,
    y: 0,
    width: 6,
    height: 4,
    settings: {},
    parameters: {},
  };
  const report = { id: "r1", ...defaults, ...overrides };
  const { dashTitle, ...reportFields } = report as Record<string, unknown>;
  return {
    ...(dashTitle !== undefined ? { title: dashTitle } : {}),
    version: "2.4",
    pages: [{ title: "P1", reports: [reportFields] }],
  };
}

describe("convertNeoDash", () => {
  it("sets formatVersion to 1", () => {
    const result = convertNeoDash(NEODASH_SIMPLE);
    expect(result.formatVersion).toBe(1);
  });

  it("sets connections to empty object", () => {
    const result = convertNeoDash(NEODASH_SIMPLE);
    expect(result.connections).toEqual({});
  });

  it("uses NeoDash title as dashboard name", () => {
    const result = convertNeoDash(NEODASH_SIMPLE);
    expect(result.dashboard.name).toBe("My NeoDash Dashboard");
  });

  it("maps table type correctly", () => {
    const result = convertNeoDash(NEODASH_SIMPLE);
    const widget = result.layout.pages[0].widgets.find(
      (w) => w.chartType === "table",
    );
    expect(widget).toBeDefined();
  });

  it("maps bar type correctly", () => {
    const result = convertNeoDash(NEODASH_SIMPLE);
    const widget = result.layout.pages[0].widgets.find(
      (w) => w.chartType === "bar",
    );
    expect(widget).toBeDefined();
  });

  it.each([
    { type: "value", expected: "single-value" },
    { type: "iframe", expected: "iframe" },
    { type: "iFrame", expected: "iframe" },
    { type: "markdown", expected: "markdown" },
    { type: "gauge", expected: "gauge" },
    { type: "select", expected: "parameter-select" },
    { type: "gantt", expected: "gantt" },
    { type: "graph3d", expected: "graph" },
    { type: "3d-graph", expected: "graph" },
    { type: "circle_packing", expected: "circle-packing" },
    { type: "circlePacking", expected: "circle-packing" },
    { type: "choropleth", expected: "choropleth" },
    { type: "areamap", expected: "choropleth" },
    { type: "text", expected: "markdown" },
    { type: "unknown_type", expected: "json" },
  ])("maps $type → $expected", ({ type, expected }) => {
    const result = convertNeoDash(makeNeoDash({ type }));
    expect(result.layout.pages[0].widgets[0].chartType).toBe(expected);
  });

  it("maps area type to line with area option", () => {
    const result = convertNeoDash(makeNeoDash({ type: "area" }));
    expect(result.layout.pages[0].widgets[0].chartType).toBe("line");
    expect(
      (result.layout.pages[0].widgets[0].settings as Record<string, unknown>)
        .chartOptions,
    ).toEqual({ area: true });
  });

  it("converts $neodash_ parameter syntax to $param_", () => {
    const result = convertNeoDash(
      makeNeoDash({
        query: "MATCH (n) WHERE n.name = $neodash_userName RETURN n",
      }),
    );
    expect(result.layout.pages[0].widgets[0].query).toBe(
      "MATCH (n) WHERE n.name = $param_userName RETURN n",
    );
  });

  it("maps x, y, width, height to GridLayoutItem i, x, y, w, h", () => {
    const result = convertNeoDash(NEODASH_SIMPLE);
    const layout = result.layout.pages[0].gridLayout;
    const item = layout[0];
    expect(item).toMatchObject({ x: 0, y: 0, w: 6, h: 4 });
    expect(item.i).toBeTruthy();
  });

  it("sets connectionId to empty string for all widgets", () => {
    const result = convertNeoDash(NEODASH_SIMPLE);
    for (const page of result.layout.pages) {
      for (const widget of page.widgets) {
        expect(widget.connectionId).toBe("");
      }
    }
  });

  it("assigns fresh UUIDs to each widget (i matches widget.id)", () => {
    const result = convertNeoDash(NEODASH_SIMPLE);
    const page = result.layout.pages[0];
    const widgetIds = page.widgets.map((w) => w.id);
    const layoutIds = page.gridLayout.map((g) => g.i);
    // Widget IDs are UUIDs (not original NeoDash r1, r2)
    for (const id of widgetIds) {
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    }
    // Layout i matches widget id
    expect(layoutIds.sort()).toEqual(widgetIds.sort());
  });

  it("converts multiple pages", () => {
    const multiPage = {
      title: "Multi",
      version: "2.4",
      pages: [
        {
          title: "P1",
          reports: [
            {
              id: "r1",
              title: "T",
              type: "table",
              query: "q",
              x: 0,
              y: 0,
              width: 6,
              height: 4,
              settings: {},
              parameters: {},
            },
          ],
        },
        {
          title: "P2",
          reports: [
            {
              id: "r2",
              title: "B",
              type: "bar",
              query: "q2",
              x: 0,
              y: 0,
              width: 6,
              height: 4,
              settings: {},
              parameters: {},
            },
          ],
        },
      ],
    };
    const result = convertNeoDash(multiPage);
    expect(result.layout.pages).toHaveLength(2);
    expect(result.layout.pages[0].title).toBe("P1");
    expect(result.layout.pages[1].title).toBe("P2");
  });

  it("sets exportedAt to a non-empty ISO string", () => {
    const result = convertNeoDash(NEODASH_SIMPLE);
    expect(result.exportedAt).toBeTruthy();
    expect(() => new Date(result.exportedAt)).not.toThrow();
  });

  it("falls back to defaults when report fields are missing", () => {
    const nd = {
      pages: [
        {
          title: "P",
          reports: [
            {
              id: "r1",
              title: "W",
              type: "table",
              // query, settings, parameters all missing
              x: 0,
              y: 0,
              width: 6,
              height: 4,
            },
          ],
        },
      ],
    };
    const result = convertNeoDash(nd);
    const widget = result.layout.pages[0].widgets[0];
    expect(widget.query).toBe("");
    expect(widget.params).toEqual({});
    // Title is preserved from report.title even when settings/parameters are missing
    expect(widget.settings).toEqual({ title: "W" });
  });

  it("falls back to 'Imported Dashboard' when title is missing", () => {
    const result = convertNeoDash(makeNeoDash({}));
    expect(result.dashboard.name).toBe("Imported Dashboard");
  });

  it("preserves the report query in widget.query", () => {
    const result = convertNeoDash(NEODASH_SIMPLE);
    const widget = result.layout.pages[0].widgets[0];
    expect(widget.query).toBe("MATCH (u:User) RETURN u.name");
  });

  it("normalizes non-finite grid coordinates to safe defaults", () => {
    const result = convertNeoDash(
      makeNeoDash({
        dashTitle: "T",
        x: NaN,
        y: Infinity,
        width: undefined,
        height: "bad",
      }),
    );
    const grid = result.layout.pages[0].gridLayout[0];
    expect(grid.x).toBe(0);
    expect(grid.y).toBe(0);
    expect(grid.w).toBe(4);
    expect(grid.h).toBe(4);
  });

  it("preserves valid grid coordinates", () => {
    const result = convertNeoDash(
      makeNeoDash({
        dashTitle: "T",
        type: "bar",
        x: 3,
        y: 5,
        width: 8,
        height: 6,
      }),
    );
    const grid = result.layout.pages[0].gridLayout[0];
    expect(grid).toMatchObject({ x: 3, y: 5, w: 8, h: 6 });
  });

  it("all direct chart type mappings", () => {
    const types = [
      "table",
      "bar",
      "line",
      "graph",
      "map",
      "pie",
      "gauge",
      "sunburst",
      "treemap",
      "sankey",
      "radar",
      "gantt",
    ];
    for (const type of types) {
      const result = convertNeoDash(makeNeoDash({ dashTitle: "T", type }));
      expect(result.layout.pages[0].widgets[0].chartType).toBe(type);
    }
  });

  // --- widget title preservation ---

  it("preserves report.title as widget settings.title", () => {
    const result = convertNeoDash(NEODASH_SIMPLE);
    const widget = result.layout.pages[0].widgets[0];
    expect((widget.settings as Record<string, unknown>).title).toBe(
      "Users Table",
    );
  });

  it("preserves report.title for all widgets", () => {
    const result = convertNeoDash(NEODASH_SIMPLE);
    const titles = result.layout.pages[0].widgets.map(
      (w) => (w.settings as Record<string, unknown>).title,
    );
    expect(titles).toEqual(["Users Table", "Bar Chart"]);
  });

  it("omits title from settings when report.title is empty", () => {
    const result = convertNeoDash(makeNeoDash({ title: "" }));
    const settings = result.layout.pages[0].widgets[0].settings as Record<
      string,
      unknown
    >;
    expect(settings.title).toBeUndefined();
  });

  // --- degraded type conversions ---

  it("maps graph3d to 2D graph (best-effort)", () => {
    const result = convertNeoDash(
      makeNeoDash({ dashTitle: "T", type: "graph3d" }),
    );
    expect(result.layout.pages[0].widgets[0].chartType).toBe("graph");
  });

  it("maps circle_packing to circle-packing (native)", () => {
    const result = convertNeoDash(
      makeNeoDash({ dashTitle: "T", type: "circle_packing" }),
    );
    expect(result.layout.pages[0].widgets[0].chartType).toBe("circle-packing");
  });

  it("maps choropleth to choropleth (native)", () => {
    const result = convertNeoDash(
      makeNeoDash({ dashTitle: "T", type: "choropleth" }),
    );
    expect(result.layout.pages[0].widgets[0].chartType).toBe("choropleth");
  });

  // --- parameter conversion ---

  it("converts multiple $neodash_ parameters in a single query", () => {
    const result = convertNeoDash(
      makeNeoDash({
        query:
          "MATCH (n) WHERE n.name = $neodash_name AND n.age > $neodash_minAge RETURN n",
      }),
    );
    expect(result.layout.pages[0].widgets[0].query).toBe(
      "MATCH (n) WHERE n.name = $param_name AND n.age > $param_minAge RETURN n",
    );
  });

  it("leaves non-neodash parameters unchanged", () => {
    const result = convertNeoDash(
      makeNeoDash({ query: "MATCH (n) WHERE n.id = $someParam RETURN n" }),
    );
    expect(result.layout.pages[0].widgets[0].query).toBe(
      "MATCH (n) WHERE n.id = $someParam RETURN n",
    );
  });

  // --- P0: dashboard description ---

  it("preserves dashboard description when present", () => {
    const nd = {
      title: "My Dashboard",
      description: "A detailed description",
      version: "2.4",
      pages: [{ title: "P1", reports: [] }],
    };
    const result = convertNeoDash(nd);
    expect(result.dashboard.description).toBe("A detailed description");
  });

  it("defaults description to null when missing", () => {
    const result = convertNeoDash(makeNeoDash({}));
    expect(result.dashboard.description).toBeNull();
  });

  // --- P1: report actions ---

  it("maps NeoDash set-parameter action to click action", () => {
    const result = convertNeoDash(
      makeNeoDash({
        dashTitle: "T",
        settings: {
          actionsRules: [
            {
              field: "name",
              customization: {
                type: "set-parameter",
                parameterName: "selected_name",
              },
            },
          ],
        },
      }),
    );
    const settings = result.layout.pages[0].widgets[0].settings as Record<
      string,
      unknown
    >;
    const action = settings.clickAction as Record<string, unknown>;
    expect(action.type).toBe("set-parameter");
    expect(
      (action.parameterMapping as Record<string, unknown>).parameterName,
    ).toBe("selected_name");
    expect(
      (action.parameterMapping as Record<string, unknown>).sourceField,
    ).toBe("name");
  });

  it("skips click action when no actionsRules", () => {
    const result = convertNeoDash(makeNeoDash({ dashTitle: "T" }));
    const settings = result.layout.pages[0].widgets[0].settings as Record<
      string,
      unknown
    >;
    expect(settings.clickAction).toBeUndefined();
  });

  it("maps NeoDash 'set variable' string-form action to click action", () => {
    // Real shape from the OpenStudyBuilder corpus — customization is a string
    // and the parameter name lives in customizationValue.
    const result = convertNeoDash(
      makeNeoDash({
        dashTitle: "T",
        settings: {
          actionsRules: [
            {
              condition: "Click",
              field: "Action ID",
              value: "Action ID",
              customization: "set variable",
              customizationValue: "action_id",
            },
          ],
        },
      }),
    );
    const settings = result.layout.pages[0].widgets[0].settings as Record<
      string,
      unknown
    >;
    const action = settings.clickAction as Record<string, unknown>;
    expect(action.type).toBe("set-parameter");
    expect(
      (action.parameterMapping as Record<string, unknown>).parameterName,
    ).toBe("action_id");
    expect(
      (action.parameterMapping as Record<string, unknown>).sourceField,
    ).toBe("Action ID");
  });

  it("ignores unknown string-form customization", () => {
    const result = convertNeoDash(
      makeNeoDash({
        dashTitle: "T",
        settings: {
          actionsRules: [{ field: "x", customization: "do something weird" }],
        },
      }),
    );
    const settings = result.layout.pages[0].widgets[0].settings as Record<
      string,
      unknown
    >;
    expect(settings.clickAction).toBeUndefined();
  });

  it("ignores 'set variable' without customizationValue", () => {
    const result = convertNeoDash(
      makeNeoDash({
        dashTitle: "T",
        settings: {
          actionsRules: [{ field: "x", customization: "set variable" }],
        },
      }),
    );
    const settings = result.layout.pages[0].widgets[0].settings as Record<
      string,
      unknown
    >;
    expect(settings.clickAction).toBeUndefined();
  });

  // --- P1: styling rules ---

  it("maps NeoDash styleRules to stylingConfig", () => {
    const result = convertNeoDash(
      makeNeoDash({
        dashTitle: "T",
        settings: {
          styleRules: [
            {
              field: "status",
              condition: "=",
              value: "active",
              color: "#00ff00",
            },
            {
              field: "status",
              condition: "=",
              value: "inactive",
              color: "#ff0000",
            },
          ],
        },
      }),
    );
    const settings = result.layout.pages[0].widgets[0].settings as Record<
      string,
      unknown
    >;
    const config = settings.stylingConfig as Record<string, unknown>;
    expect(config.enabled).toBe(true);
    const rules = config.rules as Array<Record<string, unknown>>;
    expect(rules).toHaveLength(2);
    expect(rules[0].operator).toBe("==");
    expect(rules[0].color).toBe("#00ff00");
    expect(rules[1].color).toBe("#ff0000");
  });

  // --- P1: refresh rate ---

  it("maps refreshRate to cache settings", () => {
    const result = convertNeoDash(
      makeNeoDash({
        dashTitle: "T",
        settings: { refreshRate: 300 },
      }),
    );
    const settings = result.layout.pages[0].widgets[0].settings as Record<
      string,
      unknown
    >;
    expect(settings.enableCache).toBe(true);
    expect(settings.cacheTtlMinutes).toBe(5);
  });

  it("ignores zero or negative refreshRate", () => {
    const result = convertNeoDash(
      makeNeoDash({
        dashTitle: "T",
        settings: { refreshRate: 0 },
      }),
    );
    const settings = result.layout.pages[0].widgets[0].settings as Record<
      string,
      unknown
    >;
    expect(settings.enableCache).toBeUndefined();
  });

  // --- P1: parameter defaults ---

  it("maps defaultValue from settings", () => {
    const result = convertNeoDash(
      makeNeoDash({
        dashTitle: "T",
        settings: { defaultValue: "hello" },
      }),
    );
    const settings = result.layout.pages[0].widgets[0].settings as Record<
      string,
      unknown
    >;
    expect(settings.defaultValue).toBe("hello");
  });

  // --- Conversion notes ---

  it("returns notes for downgraded types", () => {
    const nd = {
      title: "T",
      version: "2.4",
      pages: [
        {
          title: "P1",
          reports: [
            {
              id: "r1",
              title: "3D Graph",
              type: "graph3d",
              query: "q",
              x: 0,
              y: 0,
              width: 6,
              height: 4,
            },
          ],
        },
      ],
    };
    const { notes } = convertNeoDashWithNotes(nd);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0]).toContain("graph3d");
    expect(notes[0]).toContain("2D");
  });

  it("returns notes for unknown types", () => {
    const nd = {
      title: "T",
      version: "2.4",
      pages: [
        {
          title: "P1",
          reports: [
            {
              id: "r1",
              title: "Unknown",
              type: "totally_unknown",
              query: "q",
              x: 0,
              y: 0,
              width: 6,
              height: 4,
            },
          ],
        },
      ],
    };
    const { notes } = convertNeoDashWithNotes(nd);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0]).toContain("JSON Viewer");
  });

  it("returns empty notes when all types map directly", () => {
    const { notes } = convertNeoDashWithNotes(makeNeoDash({ dashTitle: "T" }));
    expect(notes).toEqual([]);
  });
});
