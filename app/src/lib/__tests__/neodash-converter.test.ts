import { describe, it, expect } from "vitest";
import { isNeoDashFormat, convertNeoDash } from "@/lib/neodash-converter";

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
});

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
    const widget = result.layout.pages[0].widgets.find((w) => w.chartType === "table");
    expect(widget).toBeDefined();
  });

  it("maps bar type correctly", () => {
    const result = convertNeoDash(NEODASH_SIMPLE);
    const widget = result.layout.pages[0].widgets.find((w) => w.chartType === "bar");
    expect(widget).toBeDefined();
  });

  it("maps value type to single-value", () => {
    const nd = {
      ...NEODASH_SIMPLE,
      pages: [{ title: "P1", reports: [{ id: "r1", title: "KPI", type: "value", query: "RETURN 42", x: 0, y: 0, width: 3, height: 2, settings: {}, parameters: {} }] }],
    };
    const result = convertNeoDash(nd);
    expect(result.layout.pages[0].widgets[0].chartType).toBe("single-value");
  });

  it("maps iframe type to json (fallback)", () => {
    const nd = {
      ...NEODASH_SIMPLE,
      pages: [{ title: "P1", reports: [{ id: "r1", title: "Frame", type: "iframe", query: "", x: 0, y: 0, width: 6, height: 4, settings: {}, parameters: {} }] }],
    };
    const result = convertNeoDash(nd);
    expect(result.layout.pages[0].widgets[0].chartType).toBe("json");
  });

  it("maps markdown type to json (fallback)", () => {
    const nd = {
      ...NEODASH_SIMPLE,
      pages: [{ title: "P1", reports: [{ id: "r1", title: "Docs", type: "markdown", query: "# Hello", x: 0, y: 0, width: 6, height: 4, settings: {}, parameters: {} }] }],
    };
    const result = convertNeoDash(nd);
    expect(result.layout.pages[0].widgets[0].chartType).toBe("json");
  });

  it("maps unknown type to json (fallback)", () => {
    const nd = {
      ...NEODASH_SIMPLE,
      pages: [{ title: "P1", reports: [{ id: "r1", title: "Weird", type: "unknown_type", query: "", x: 0, y: 0, width: 6, height: 4, settings: {}, parameters: {} }] }],
    };
    const result = convertNeoDash(nd);
    expect(result.layout.pages[0].widgets[0].chartType).toBe("json");
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
        { title: "P1", reports: [{ id: "r1", title: "T", type: "table", query: "q", x: 0, y: 0, width: 6, height: 4, settings: {}, parameters: {} }] },
        { title: "P2", reports: [{ id: "r2", title: "B", type: "bar", query: "q2", x: 0, y: 0, width: 6, height: 4, settings: {}, parameters: {} }] },
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

  it("preserves the report query in widget.query", () => {
    const result = convertNeoDash(NEODASH_SIMPLE);
    const widget = result.layout.pages[0].widgets[0];
    expect(widget.query).toBe("MATCH (u:User) RETURN u.name");
  });

  it("all chart type mappings", () => {
    const types = ["table", "bar", "line", "graph", "map", "pie"];
    for (const type of types) {
      const nd = {
        title: "T",
        version: "2.4",
        pages: [{ title: "P", reports: [{ id: "r1", title: "W", type, query: "q", x: 0, y: 0, width: 6, height: 4, settings: {}, parameters: {} }] }],
      };
      const result = convertNeoDash(nd);
      expect(result.layout.pages[0].widgets[0].chartType).toBe(type);
    }
  });
});
