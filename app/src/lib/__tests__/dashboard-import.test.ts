import { describe, it, expect } from "vitest";
import { neoboardExportSchema, applyConnectionMapping } from "@/lib/dashboard-import";
import type { DashboardLayoutV2 } from "@/lib/db/schema";

const VALID_EXPORT = {
  formatVersion: 1,
  exportedAt: "2024-01-01T00:00:00.000Z",
  dashboard: { name: "My Dashboard", description: null },
  connections: {
    conn_0: { name: "Neo4j Prod", type: "neo4j" },
    conn_1: { name: "PG Analytics", type: "postgresql" },
  },
  layout: {
    version: 2,
    pages: [
      {
        id: "p1",
        title: "Page 1",
        widgets: [
          { id: "w1", chartType: "bar", connectionId: "conn_0", query: "MATCH (n) RETURN n" },
        ],
        gridLayout: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
      },
    ],
  },
};

describe("neoboardExportSchema", () => {
  it("accepts a valid NeoBoard export", () => {
    const result = neoboardExportSchema.safeParse(VALID_EXPORT);
    expect(result.success).toBe(true);
  });

  it("rejects missing formatVersion", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { formatVersion: _fv, ...noVersion } = VALID_EXPORT;
    const result = neoboardExportSchema.safeParse(noVersion);
    expect(result.success).toBe(false);
  });

  it("rejects formatVersion: 2 (only v1 supported)", () => {
    const result = neoboardExportSchema.safeParse({ ...VALID_EXPORT, formatVersion: 2 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid layout (missing version: 2)", () => {
    const result = neoboardExportSchema.safeParse({
      ...VALID_EXPORT,
      layout: { pages: [] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty dashboard name", () => {
    const result = neoboardExportSchema.safeParse({
      ...VALID_EXPORT,
      dashboard: { name: "", description: null },
    });
    expect(result.success).toBe(false);
  });

  it("accepts dashboard with description as a string", () => {
    const result = neoboardExportSchema.safeParse({
      ...VALID_EXPORT,
      dashboard: { name: "Test", description: "Some desc" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty connections map", () => {
    const result = neoboardExportSchema.safeParse({
      ...VALID_EXPORT,
      connections: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing exportedAt", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { exportedAt: _ea, ...noDate } = VALID_EXPORT;
    const result = neoboardExportSchema.safeParse(noDate);
    expect(result.success).toBe(false);
  });
});

describe("applyConnectionMapping", () => {
  const layout: DashboardLayoutV2 = {
    version: 2,
    pages: [
      {
        id: "p1",
        title: "Page 1",
        widgets: [
          { id: "w1", chartType: "bar", connectionId: "conn_0", query: "q1" },
          { id: "w2", chartType: "table", connectionId: "conn_1", query: "q2" },
          { id: "w3", chartType: "parameter-select", connectionId: "", query: "" },
        ],
        gridLayout: [
          { i: "w1", x: 0, y: 0, w: 6, h: 4 },
          { i: "w2", x: 6, y: 0, w: 6, h: 4 },
        ],
      },
    ],
  };

  const mapping = {
    conn_0: "real-neo4j-id",
    conn_1: "real-pg-id",
  };

  it("replaces conn_N placeholders with real connection IDs", () => {
    const result = applyConnectionMapping(layout, mapping);
    const widgets = result.pages[0].widgets;
    expect(widgets[0].connectionId).toBe("real-neo4j-id");
    expect(widgets[1].connectionId).toBe("real-pg-id");
  });

  it("leaves empty connectionId unchanged", () => {
    const result = applyConnectionMapping(layout, mapping);
    const widgets = result.pages[0].widgets;
    expect(widgets[2].connectionId).toBe("");
  });

  it("does not mutate the original layout", () => {
    const original = JSON.stringify(layout);
    applyConnectionMapping(layout, mapping);
    expect(JSON.stringify(layout)).toBe(original);
  });

  it("leaves unmapped keys unchanged", () => {
    const result = applyConnectionMapping(layout, { conn_0: "real-neo4j-id" });
    const widgets = result.pages[0].widgets;
    // conn_1 not in mapping → stays as conn_1
    expect(widgets[1].connectionId).toBe("conn_1");
  });

  it("applies mapping across multiple pages", () => {
    const multiPage: DashboardLayoutV2 = {
      version: 2,
      pages: [
        { id: "p1", title: "P1", widgets: [{ id: "w1", chartType: "bar", connectionId: "conn_0", query: "q" }], gridLayout: [] },
        { id: "p2", title: "P2", widgets: [{ id: "w2", chartType: "table", connectionId: "conn_0", query: "q2" }], gridLayout: [] },
      ],
    };
    const result = applyConnectionMapping(multiPage, { conn_0: "my-real-id" });
    expect(result.pages[0].widgets[0].connectionId).toBe("my-real-id");
    expect(result.pages[1].widgets[0].connectionId).toBe("my-real-id");
  });
});
