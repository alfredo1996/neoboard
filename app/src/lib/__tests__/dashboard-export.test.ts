import { describe, it, expect } from "vitest";
import { buildExportPayload } from "@/lib/dashboard-export";
import type { DashboardLayoutV2 } from "@/lib/db/schema";

const LAYOUT: DashboardLayoutV2 = {
  version: 2,
  pages: [
    {
      id: "page-1",
      title: "Page 1",
      widgets: [
        {
          id: "w1",
          chartType: "bar",
          connectionId: "conn-abc",
          query: "MATCH (n) RETURN n",
        },
        {
          id: "w2",
          chartType: "table",
          connectionId: "conn-xyz",
          query: "SELECT 1",
        },
        {
          id: "w3",
          chartType: "parameter-select",
          connectionId: "",
          query: "",
        },
      ],
      gridLayout: [
        { i: "w1", x: 0, y: 0, w: 6, h: 4 },
        { i: "w2", x: 6, y: 0, w: 6, h: 4 },
        { i: "w3", x: 0, y: 4, w: 3, h: 2 },
      ],
    },
  ],
};

const CONNECTION_ROWS = [
  { id: "conn-abc", name: "Neo4j Prod", type: "neo4j" },
  { id: "conn-xyz", name: "PG Analytics", type: "postgresql" },
];

const DASHBOARD = {
  id: "d1",
  userId: "u1",
  tenantId: "default",
  name: "My Dashboard",
  description: "A test dashboard",
  layoutJson: LAYOUT,
  thumbnailJson: null,
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  updatedBy: null,
};

describe("buildExportPayload", () => {
  it("sets formatVersion to 1", () => {
    const result = buildExportPayload(DASHBOARD, CONNECTION_ROWS);
    expect(result.formatVersion).toBe(1);
  });

  it("sets exportedAt to a non-empty ISO string", () => {
    const result = buildExportPayload(DASHBOARD, CONNECTION_ROWS);
    expect(result.exportedAt).toBeTruthy();
    expect(() => new Date(result.exportedAt)).not.toThrow();
  });

  it("includes dashboard name and description", () => {
    const result = buildExportPayload(DASHBOARD, CONNECTION_ROWS);
    expect(result.dashboard.name).toBe("My Dashboard");
    expect(result.dashboard.description).toBe("A test dashboard");
  });

  it("replaces unique connectionIds with conn_N keys", () => {
    const result = buildExportPayload(DASHBOARD, CONNECTION_ROWS);
    const widgets = result.layout.pages[0].widgets;
    // Both conn-abc and conn-xyz should be replaced
    const ids = widgets.map((w) => w.connectionId);
    expect(ids).toContain("conn_0");
    expect(ids).toContain("conn_1");
    // Should not contain original IDs
    expect(ids).not.toContain("conn-abc");
    expect(ids).not.toContain("conn-xyz");
  });

  it("keeps empty connectionId unchanged for param-select widgets", () => {
    const result = buildExportPayload(DASHBOARD, CONNECTION_ROWS);
    const widgets = result.layout.pages[0].widgets;
    const paramWidget = widgets.find((w) => w.chartType === "parameter-select");
    expect(paramWidget?.connectionId).toBe("");
  });

  it("populates connections map with name and type", () => {
    const result = buildExportPayload(DASHBOARD, CONNECTION_ROWS);
    const keys = Object.keys(result.connections);
    expect(keys).toHaveLength(2);

    const conn0 = result.connections["conn_0"];
    const conn1 = result.connections["conn_1"];

    // One should be neo4j, other postgresql
    const types = [conn0.type, conn1.type].sort();
    expect(types).toEqual(["neo4j", "postgresql"]);
  });

  it("connections map entries have name and type only (no credentials)", () => {
    const result = buildExportPayload(DASHBOARD, CONNECTION_ROWS);
    for (const val of Object.values(result.connections)) {
      expect(val).toHaveProperty("name");
      expect(val).toHaveProperty("type");
      expect(val).not.toHaveProperty("id");
      expect(val).not.toHaveProperty("configEncrypted");
    }
  });

  it("does not mutate the original layout", () => {
    const original = JSON.stringify(LAYOUT);
    buildExportPayload(DASHBOARD, CONNECTION_ROWS);
    expect(JSON.stringify(LAYOUT)).toBe(original);
  });

  it("handles dashboard with null description", () => {
    const dashboardNoDesc = { ...DASHBOARD, description: null };
    const result = buildExportPayload(dashboardNoDesc, CONNECTION_ROWS);
    expect(result.dashboard.description).toBeNull();
  });

  it("handles layout with multiple pages", () => {
    const multiPageLayout: DashboardLayoutV2 = {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "P1",
          widgets: [{ id: "w1", chartType: "bar", connectionId: "conn-abc", query: "q" }],
          gridLayout: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
        },
        {
          id: "p2",
          title: "P2",
          widgets: [{ id: "w2", chartType: "table", connectionId: "conn-abc", query: "q2" }],
          gridLayout: [{ i: "w2", x: 0, y: 0, w: 6, h: 4 }],
        },
      ],
    };
    const d = { ...DASHBOARD, layoutJson: multiPageLayout };
    const result = buildExportPayload(d, [{ id: "conn-abc", name: "Neo4j", type: "neo4j" }]);
    // Same connectionId used twice → only one key
    expect(Object.keys(result.connections)).toHaveLength(1);
    // Both pages' widgets replaced
    expect(result.layout.pages[0].widgets[0].connectionId).toBe("conn_0");
    expect(result.layout.pages[1].widgets[0].connectionId).toBe("conn_0");
  });

  it("handles layout with no widgets", () => {
    const emptyLayout: DashboardLayoutV2 = {
      version: 2,
      pages: [{ id: "p1", title: "P1", widgets: [], gridLayout: [] }],
    };
    const d = { ...DASHBOARD, layoutJson: emptyLayout };
    const result = buildExportPayload(d, []);
    expect(Object.keys(result.connections)).toHaveLength(0);
    expect(result.layout.pages[0].widgets).toHaveLength(0);
  });
});
