import { describe, it, expect } from "vitest";
import {
  isNeoDashFormat,
  convertNeoDash,
  convertNeoDashWithNotes,
  inferParameterType,
  extractParamReferences,
} from "../neodash-converter";

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeReport(
  overrides: Partial<{
    id: string;
    title: string;
    type: string;
    query: string;
    settings: Record<string, unknown>;
  }> = {},
) {
  return {
    id: overrides.id ?? "r1",
    title: overrides.title ?? "Report",
    type: overrides.type ?? "table",
    query: overrides.query ?? "MATCH (n) RETURN n",
    x: 0,
    y: 0,
    width: 6,
    height: 4,
    settings: overrides.settings ?? {},
    parameters: {},
  };
}

function makeNeoDash(
  reports: ReturnType<typeof makeReport>[],
  settings?: { parameters?: Record<string, unknown> },
) {
  return {
    title: "Test Dashboard",
    version: "2.4",
    pages: [
      {
        title: "Page 1",
        reports,
      },
    ],
    ...(settings ? { settings } : {}),
  };
}

/**
 * Single-report NeoDash fixture with per-report overrides.
 * `dashTitle` sets the *dashboard* title; omit it to exercise the
 * "Imported Dashboard" fallback.
 */
function makeSingleReportDash(overrides: Record<string, unknown> = {}) {
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

// ---------------------------------------------------------------------------
// isNeoDashFormat
// ---------------------------------------------------------------------------

describe("isNeoDashFormat", () => {
  it("recognizes a NeoDash v2.x dashboard (has pages[0].reports)", () => {
    expect(isNeoDashFormat(makeNeoDash([makeReport()]))).toBe(true);
    expect(isNeoDashFormat(NEODASH_SIMPLE)).toBe(true);
  });

  it("returns false for NeoBoard export format", () => {
    expect(isNeoDashFormat(NEOBOARD_FORMAT)).toBe(false);
  });

  it("rejects null / undefined / non-objects", () => {
    expect(isNeoDashFormat(null)).toBe(false);
    expect(isNeoDashFormat(undefined)).toBe(false);
    expect(isNeoDashFormat("string")).toBe(false);
    expect(isNeoDashFormat("not an object")).toBe(false);
    expect(isNeoDashFormat(42)).toBe(false);
  });

  it("rejects arrays", () => {
    expect(isNeoDashFormat([])).toBe(false);
  });

  it("rejects objects without pages", () => {
    expect(isNeoDashFormat({ title: "x" })).toBe(false);
    expect(isNeoDashFormat({})).toBe(false);
  });

  it("returns false when pages is empty array", () => {
    expect(isNeoDashFormat({ pages: [] })).toBe(false);
  });

  it("returns false when pages[0] has no reports", () => {
    expect(isNeoDashFormat({ pages: [{ title: "P1" }] })).toBe(false);
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

// ---------------------------------------------------------------------------
// inferParameterType
// ---------------------------------------------------------------------------

describe("inferParameterType", () => {
  it("returns multi-select for arrays", () => {
    expect(inferParameterType([])).toBe("multi-select");
    expect(inferParameterType(["a", "b"])).toBe("multi-select");
  });

  it("returns number-range for finite numbers", () => {
    expect(inferParameterType(0)).toBe("number-range");
    expect(inferParameterType(42)).toBe("number-range");
    expect(inferParameterType(3.14)).toBe("number-range");
  });

  it("does not return number-range for NaN / Infinity", () => {
    expect(inferParameterType(Number.NaN)).toBe("select");
    expect(inferParameterType(Number.POSITIVE_INFINITY)).toBe("select");
  });

  it("returns text for empty string", () => {
    expect(inferParameterType("")).toBe("text");
  });

  it("returns select for non-empty strings (NeoDash's most common case)", () => {
    expect(inferParameterType("foo")).toBe("select");
    expect(inferParameterType("Y")).toBe("select");
    expect(inferParameterType("N")).toBe("select");
  });

  it("returns select for null / undefined / objects", () => {
    expect(inferParameterType(null)).toBe("select");
    expect(inferParameterType(undefined)).toBe("select");
    expect(inferParameterType({})).toBe("select");
  });
});

// ---------------------------------------------------------------------------
// extractParamReferences
// ---------------------------------------------------------------------------

describe("extractParamReferences", () => {
  it("extracts $param_xxx names from queries", () => {
    const refs = extractParamReferences([
      "MATCH (n) WHERE n.name = $param_userName RETURN n",
      "MATCH (m) WHERE m.year > $param_year RETURN m",
    ]);
    expect([...refs].sort()).toEqual(["userName", "year"]);
  });

  it("returns unique names when referenced multiple times", () => {
    const refs = extractParamReferences(["$param_x + $param_x + $param_y"]);
    expect([...refs].sort()).toEqual(["x", "y"]);
  });

  it("ignores $paramX without underscore", () => {
    const refs = extractParamReferences(["$paramFoo"]);
    expect(refs.size).toBe(0);
  });

  it("ignores bare param_xxx without leading $", () => {
    const refs = extractParamReferences(["param_foo"]);
    expect(refs.size).toBe(0);
  });

  it("skips empty / undefined queries", () => {
    const refs = extractParamReferences(["", "$param_x"]);
    expect([...refs]).toEqual(["x"]);
  });
});

// ---------------------------------------------------------------------------
// convertNeoDash — envelope, type mapping, grid, settings mappers
// ---------------------------------------------------------------------------

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
    { type: "choropleth", expected: "choropleth" },
    { type: "areamap", expected: "choropleth" },
    { type: "text", expected: "markdown" },
    { type: "unknown_type", expected: "json" },
  ])("maps $type → $expected", ({ type, expected }) => {
    const result = convertNeoDash(makeSingleReportDash({ type }));
    expect(result.layout.pages[0].widgets[0].chartType).toBe(expected);
  });

  it("maps area type to line with area option", () => {
    const result = convertNeoDash(makeSingleReportDash({ type: "area" }));
    expect(result.layout.pages[0].widgets[0].chartType).toBe("line");
    expect(
      (result.layout.pages[0].widgets[0].settings as Record<string, unknown>)
        .chartOptions,
    ).toEqual({ area: true });
  });

  // NeoDash bar reports carry `groupMode: "grouped" | "stacked"`; NeoBoard's
  // bar plugin reads `chartOptions.stackMode` (#1684).
  it("maps a NeoDash stacked bar to stackMode: 'stacked'", () => {
    const result = convertNeoDash(
      makeSingleReportDash({
        type: "bar",
        settings: { groupMode: "stacked" },
      }),
    );
    expect(
      (result.layout.pages[0].widgets[0].settings as Record<string, unknown>)
        .chartOptions,
    ).toEqual({ stackMode: "stacked" });
  });

  // NeoDash defaults an unset groupMode to "stacked" (ReportConfig.tsx /
  // BarChart.tsx), so an untouched bar must import as stacked too.
  it("maps a NeoDash bar with no groupMode to stackMode: 'stacked'", () => {
    const result = convertNeoDash(
      makeSingleReportDash({ type: "bar", settings: {} }),
    );
    expect(
      (result.layout.pages[0].widgets[0].settings as Record<string, unknown>)
        .chartOptions,
    ).toEqual({ stackMode: "stacked" });
  });

  it("does not stack a non-bar report that carries a stray groupMode", () => {
    const result = convertNeoDash(
      makeSingleReportDash({ type: "table", settings: { groupMode: "stacked" } }),
    );
    expect(
      (result.layout.pages[0].widgets[0].settings as Record<string, unknown>)
        .chartOptions,
    ).toBeUndefined();
  });

  it("leaves chartOptions alone for a grouped NeoDash bar", () => {
    const result = convertNeoDash(
      makeSingleReportDash({
        type: "bar",
        settings: { groupMode: "grouped" },
      }),
    );
    expect(
      (result.layout.pages[0].widgets[0].settings as Record<string, unknown>)
        .chartOptions,
    ).toBeUndefined();
  });

  it("converts $neodash_ parameter syntax to $param_", () => {
    const result = convertNeoDash(
      makeSingleReportDash({
        query: "MATCH (n) WHERE n.name = $neodash_userName RETURN n",
      }),
    );
    // Referencing $param_userName triggers a Filters page being prepended
    // (auto-generated parameter-select for the undefined param). Original at index 1.
    expect(result.layout.pages[1].widgets[0].query).toBe(
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
    const result = convertNeoDash(makeSingleReportDash({}));
    expect(result.dashboard.name).toBe("Imported Dashboard");
  });

  it("preserves the report query in widget.query", () => {
    const result = convertNeoDash(NEODASH_SIMPLE);
    const widget = result.layout.pages[0].widgets[0];
    expect(widget.query).toBe("MATCH (u:User) RETURN u.name");
  });

  it("normalizes non-finite grid coordinates to safe defaults", () => {
    const result = convertNeoDash(
      makeSingleReportDash({
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
      makeSingleReportDash({
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
      "sankey",
      "radar",
      "gantt",
    ];
    for (const type of types) {
      const result = convertNeoDash(
        makeSingleReportDash({ dashTitle: "T", type }),
      );
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
    const result = convertNeoDash(makeSingleReportDash({ title: "" }));
    const settings = result.layout.pages[0].widgets[0].settings as Record<
      string,
      unknown
    >;
    expect(settings.title).toBeUndefined();
  });

  // --- degraded type conversions ---

  it("maps graph3d to 2D graph (best-effort)", () => {
    const result = convertNeoDash(
      makeSingleReportDash({ dashTitle: "T", type: "graph3d" }),
    );
    expect(result.layout.pages[0].widgets[0].chartType).toBe("graph");
  });

  // #1687 — circle packing and treemap are no longer registered in the app,
  // so a NeoDash report of either type is skipped with a note rather than
  // imported as a widget that would render "Unknown chart type".
  it.each(["circle_packing", "circlePacking", "treemap"])(
    "skips a %s report with an unsupported-type note and no widget",
    (type) => {
      const { export: result, notes } = convertNeoDashWithNotes(
        makeSingleReportDash({ dashTitle: "T", type }),
      );
      expect(result.layout.pages[0].widgets).toEqual([]);
      expect(result.layout.pages[0].gridLayout).toEqual([]);
      expect(notes).toEqual([
        `"W" (${type}) → unsupported in NeoBoard, skipped`,
      ]);
    },
  );

  it("maps choropleth to choropleth (native)", () => {
    const result = convertNeoDash(
      makeSingleReportDash({ dashTitle: "T", type: "choropleth" }),
    );
    expect(result.layout.pages[0].widgets[0].chartType).toBe("choropleth");
  });

  // --- parameter conversion ---

  it("converts multiple $neodash_ parameters in a single query", () => {
    const result = convertNeoDash(
      makeSingleReportDash({
        query:
          "MATCH (n) WHERE n.name = $neodash_name AND n.age > $neodash_minAge RETURN n",
      }),
    );
    // Two referenced params → Filters page prepended; original page at index 1.
    expect(result.layout.pages[1].widgets[0].query).toBe(
      "MATCH (n) WHERE n.name = $param_name AND n.age > $param_minAge RETURN n",
    );
  });

  it("leaves non-neodash parameters unchanged", () => {
    const result = convertNeoDash(
      makeSingleReportDash({
        query: "MATCH (n) WHERE n.id = $someParam RETURN n",
      }),
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
    const result = convertNeoDash(makeSingleReportDash({}));
    expect(result.dashboard.description).toBeNull();
  });

  // --- P1: report actions ---

  it("maps NeoDash set-parameter action to click action", () => {
    const result = convertNeoDash(
      makeSingleReportDash({
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
    const result = convertNeoDash(makeSingleReportDash({ dashTitle: "T" }));
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
      makeSingleReportDash({
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
      makeSingleReportDash({
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
      makeSingleReportDash({
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
      makeSingleReportDash({
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
      makeSingleReportDash({
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
      makeSingleReportDash({
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
      makeSingleReportDash({
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
    const { notes } = convertNeoDashWithNotes(
      makeSingleReportDash({ dashTitle: "T" }),
    );
    expect(notes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// convertNeoDashWithNotes — markdown content
// ---------------------------------------------------------------------------

describe("convertNeoDashWithNotes — markdown widgets", () => {
  it("moves text report.query into settings.content and clears widget.query", () => {
    const nd = makeNeoDash([
      makeReport({
        type: "text",
        title: "Welcome",
        query: "## Hello\n\nMarkdown content here.",
      }),
    ]);

    const { export: exp, notes } = convertNeoDashWithNotes(nd);
    const widget = exp.layout.pages[0].widgets[0];

    expect(widget.chartType).toBe("markdown");
    expect(widget.query).toBe("");
    expect((widget.settings as Record<string, unknown>).content).toBe(
      "## Hello\n\nMarkdown content here.",
    );
    expect(notes).toContain('Imported markdown content for "Welcome"');
  });

  it("handles 'markdown' type the same as 'text'", () => {
    const nd = makeNeoDash([
      makeReport({
        type: "markdown",
        title: "Notes",
        query: "**bold**",
      }),
    ]);

    const { export: exp } = convertNeoDashWithNotes(nd);
    const widget = exp.layout.pages[0].widgets[0];
    expect(widget.chartType).toBe("markdown");
    expect(widget.query).toBe("");
    expect((widget.settings as Record<string, unknown>).content).toBe(
      "**bold**",
    );
  });

  it("does not add a markdown note when report.query is empty", () => {
    const nd = makeNeoDash([
      makeReport({ type: "text", title: "Empty MD", query: "" }),
    ]);
    const { notes } = convertNeoDashWithNotes(nd);
    expect(notes.some((n) => n.includes("Imported markdown content"))).toBe(
      false,
    );
  });

  it("leaves non-markdown widgets' query in place (no settings.content)", () => {
    const nd = makeNeoDash([
      makeReport({
        type: "bar",
        title: "Bar",
        query: "MATCH (n) RETURN n.year, count(*)",
      }),
    ]);
    const widget =
      convertNeoDashWithNotes(nd).export.layout.pages[0].widgets[0];
    expect(widget.query).toBe("MATCH (n) RETURN n.year, count(*)");
    expect(
      (widget.settings as Record<string, unknown>).content,
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// convertNeoDashWithNotes — parameter widgets
// ---------------------------------------------------------------------------

describe("convertNeoDashWithNotes — parameter widgets", () => {
  it("creates a parameter-select widget for each referenced + defined param", () => {
    const nd = makeNeoDash(
      [
        makeReport({
          query: "MATCH (n) WHERE n.year = $neodash_year RETURN n",
        }),
      ],
      { parameters: { neodash_year: 2024 } },
    );

    const { export: exp, notes } = convertNeoDashWithNotes(nd);
    expect(exp.layout.pages).toHaveLength(2); // Filters + original
    expect(exp.layout.pages[0].title).toBe("Filters");
    const filterWidget = exp.layout.pages[0].widgets[0];
    expect(filterWidget.chartType).toBe("parameter-select");
    const s = filterWidget.settings as Record<string, unknown>;
    expect(s.parameterName).toBe("year");
    expect(s.parameterType).toBe("number-range");
    expect(s.defaultValue).toBe(2024);
    expect(notes.some((n) => n.includes("$param_year"))).toBe(true);

    // Verify the original widget's query was rewritten from $neodash_year
    // → $param_year (CR finding: the test asserted filter creation but not
    // the parallel query-syntax conversion).
    const originalWidget = exp.layout.pages[1].widgets[0];
    expect(originalWidget.query).toContain("$param_year");
    expect(originalWidget.query).not.toContain("$neodash_year");
  });

  it("skips parameters that are defined but never referenced", () => {
    const nd = makeNeoDash([makeReport({ query: "MATCH (n) RETURN n" })], {
      parameters: { neodash_unused: "x", neodash_other: 5 },
    });

    const { export: exp, notes } = convertNeoDashWithNotes(nd);
    expect(exp.layout.pages).toHaveLength(1); // No Filters page
    expect(notes.filter((n) => n.includes("never referenced"))).toHaveLength(2);
  });

  it("creates parameter-select for referenced-but-undefined params with a warning note", () => {
    // Use realistic NeoDash syntax — convertParamSyntax rewrites it to $param_,
    // and the extractor sees the rewritten form (CR finding: tests should
    // exercise the conversion path, not bypass it).
    const nd = makeNeoDash([
      makeReport({
        query: "MATCH (n) WHERE n.name = $neodash_undeclared RETURN n",
      }),
    ]);

    const { export: exp, notes } = convertNeoDashWithNotes(nd);
    expect(exp.layout.pages).toHaveLength(2);
    const filterWidget = exp.layout.pages[0].widgets[0];
    expect(
      (filterWidget.settings as Record<string, unknown>).parameterName,
    ).toBe("undeclared");
    expect(
      (filterWidget.settings as Record<string, unknown>).defaultValue,
    ).toBeUndefined();
    expect(notes.some((n) => n.includes("not defined in NeoDash"))).toBe(true);
  });

  it("infers types correctly per default value", () => {
    // Use real NeoDash $neodash_ syntax so the conversion path is exercised
    // (CR finding: pre-converted $param_ bypasses convertParamSyntax).
    const nd = makeNeoDash(
      [
        makeReport({
          query:
            "$neodash_str $neodash_emp $neodash_arr $neodash_num $neodash_yn",
        }),
      ],
      {
        parameters: {
          neodash_str: "value",
          neodash_emp: "",
          neodash_arr: ["a"],
          neodash_num: 10,
          neodash_yn: "Y",
        },
      },
    );

    const { export: exp } = convertNeoDashWithNotes(nd);
    const byName = Object.fromEntries(
      exp.layout.pages[0].widgets.map((w) => [
        (w.settings as Record<string, unknown>).parameterName as string,
        (w.settings as Record<string, unknown>).parameterType as string,
      ]),
    );
    expect(byName.str).toBe("select");
    expect(byName.emp).toBe("text");
    expect(byName.arr).toBe("multi-select");
    expect(byName.num).toBe("number-range");
    expect(byName.yn).toBe("select");
  });

  it("strips the 'neodash_' prefix from parameter names", () => {
    const nd = makeNeoDash([makeReport({ query: "$neodash_userId" })], {
      parameters: { neodash_userId: "alice" },
    });

    const { export: exp } = convertNeoDashWithNotes(nd);
    expect(
      (exp.layout.pages[0].widgets[0].settings as Record<string, unknown>)
        .parameterName,
    ).toBe("userId");
  });

  it("does not create a Filters page when no params are referenced", () => {
    const nd = makeNeoDash([makeReport({ query: "MATCH (n) RETURN n" })]);
    const { export: exp } = convertNeoDashWithNotes(nd);
    expect(exp.layout.pages).toHaveLength(1);
    expect(exp.layout.pages[0].title).toBe("Page 1");
  });

  it("tiles param widgets 4-per-row at w=3 h=2", () => {
    const params: Record<string, unknown> = {};
    const queryParts: string[] = [];
    for (let i = 0; i < 6; i++) {
      params[`neodash_p${i}`] = `v${i}`;
      queryParts.push(`$neodash_p${i}`);
    }
    const nd = makeNeoDash([makeReport({ query: queryParts.join(" ") })], {
      parameters: params,
    });

    const { export: exp } = convertNeoDashWithNotes(nd);
    const filtersGrid = exp.layout.pages[0].gridLayout;
    expect(filtersGrid).toHaveLength(6);
    // Row 0: 4 widgets at y=0, x=0/3/6/9
    expect(filtersGrid.slice(0, 4).map((g) => g.y)).toEqual([0, 0, 0, 0]);
    expect(filtersGrid.slice(0, 4).map((g) => g.x)).toEqual([0, 3, 6, 9]);
    // Row 1: 2 widgets at y=2, x=0/3
    expect(filtersGrid.slice(4, 6).map((g) => g.y)).toEqual([2, 2]);
    expect(filtersGrid.slice(4, 6).map((g) => g.x)).toEqual([0, 3]);
    // Every widget at w=3 h=2
    expect(filtersGrid.every((g) => g.w === 3 && g.h === 2)).toBe(true);
  });

  it("number-range pre-populates rangeMin=min(default, 0) and rangeMax=max(default, 100)", () => {
    const nd = makeNeoDash(
      [
        makeReport({
          query: "$neodash_small $neodash_big $neodash_neg",
        }),
      ],
      { parameters: { neodash_small: 5, neodash_big: 500, neodash_neg: -10 } },
    );

    const { export: exp } = convertNeoDashWithNotes(nd);
    const byName = Object.fromEntries(
      exp.layout.pages[0].widgets.map((w) => [
        (w.settings as Record<string, unknown>).parameterName as string,
        w.settings as Record<string, unknown>,
      ]),
    );
    expect(byName.small.rangeMin).toBe(0);
    expect(byName.small.rangeMax).toBe(100); // max(5, 100)
    expect(byName.big.rangeMin).toBe(0);
    expect(byName.big.rangeMax).toBe(500);
    // CR caught: negative defaults need rangeMin to widen below 0
    expect(byName.neg.rangeMin).toBe(-10);
    expect(byName.neg.rangeMax).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// convertNeoDashWithNotes — connectionId default
// ---------------------------------------------------------------------------

describe("convertNeoDashWithNotes — defaultConnectionId", () => {
  it("stamps the provided id on every widget", () => {
    const nd = makeNeoDash([makeReport({ id: "a" }), makeReport({ id: "b" })]);
    const { export: exp } = convertNeoDashWithNotes(nd, "conn-123");
    for (const w of exp.layout.pages[0].widgets) {
      expect(w.connectionId).toBe("conn-123");
    }
  });

  it("falls back to empty string when omitted", () => {
    const nd = makeNeoDash([makeReport()]);
    const { export: exp } = convertNeoDashWithNotes(nd);
    expect(exp.layout.pages[0].widgets[0].connectionId).toBe("");
  });

  it("filter widgets always have connectionId='' (no connection needed)", () => {
    const nd = makeNeoDash([makeReport({ query: "$param_x" })], {
      parameters: { neodash_x: "v" },
    });
    const { export: exp } = convertNeoDashWithNotes(nd, "conn-123");
    // Original page widgets get the stamped connection
    expect(exp.layout.pages[1].widgets[0].connectionId).toBe("conn-123");
    // Filter widgets are parameter-select, no query, no connection
    expect(exp.layout.pages[0].widgets[0].connectionId).toBe("");
  });
});

describe("convertNeoDashWithNotes — multi-rule click actions (#882)", () => {
  it("imports the first action rule and notes the dropped ones", () => {
    const nd = makeNeoDash([
      makeReport({
        type: "table",
        title: "Standard selection",
        query: "MATCH (n) RETURN n",
        settings: {
          actionsRules: [
            {
              condition: "Click",
              field: "Select",
              value: "SponsorModelIg",
              customization: "set variable",
              customizationValue: "sponsor_model",
            },
            {
              condition: "Click",
              field: "Select",
              value: "15",
              customization: "set variable",
              customizationValue: "sponsor_version_number",
            },
          ],
        },
      }),
    ]);

    const { export: exp, notes } = convertNeoDashWithNotes(nd);
    const widget = exp.layout.pages[0].widgets[0];
    const action = (widget.settings as Record<string, unknown>)
      .clickAction as Record<string, unknown>;

    // First rule imported as the single click action
    expect(action?.type).toBe("set-parameter");
    expect(
      (action.parameterMapping as Record<string, unknown>).parameterName,
    ).toBe("sponsor_model");

    // The dropped second rule is surfaced as a non-blocking note
    expect(
      notes.some(
        (n) =>
          n.includes("Standard selection") &&
          /dropped 1 .*click action/i.test(n),
      ),
    ).toBe(true);
  });

  it("does not add a dropped-rule note for a single-rule action", () => {
    const nd = makeNeoDash([
      makeReport({
        type: "table",
        title: "Single",
        query: "MATCH (n) RETURN n",
        settings: {
          actionsRules: [
            {
              condition: "Click",
              field: "Select",
              value: "x",
              customization: "set variable",
              customizationValue: "p",
            },
          ],
        },
      }),
    ]);
    const { notes } = convertNeoDashWithNotes(nd);
    expect(notes.some((n) => /dropped.*click action/i.test(n))).toBe(false);
  });
});
