import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { execute: vi.fn() },
}));

import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  getConnectionUsage,
  getConnectionWidgetCounts,
} from "../connection-usage";

/** The SQL text and bound parameters of the n-th query run. */
function ran(n = 0) {
  return new PgDialect().sqlToQuery(mockExecute.mock.calls[n][0]);
}

const mockExecute = db.execute as unknown as ReturnType<typeof vi.fn>;

describe("getConnectionUsage", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("returns { widgetCount: 0, dashboards: [] } when no dashboards reference the connection", async () => {
    mockExecute.mockResolvedValue([]);

    const result = await getConnectionUsage("conn-1", "user-1", false, "t-1");

    expect(result).toEqual({ widgetCount: 0, dashboards: [] });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("aggregates widget_count from each row into a top-level total", async () => {
    mockExecute.mockResolvedValue([
      { id: "d1", name: "Sales", widget_count: 2 },
      { id: "d2", name: "Inventory", widget_count: 1 },
    ]);

    const result = await getConnectionUsage("conn-1", "user-1", false, "t-1");

    expect(result.widgetCount).toBe(3);
    expect(result.dashboards).toEqual([
      { id: "d1", name: "Sales", widgetCount: 2 },
      { id: "d2", name: "Inventory", widgetCount: 1 },
    ]);
  });

  it("coerces a null widget_count to 0 (defence against driver quirks)", async () => {
    mockExecute.mockResolvedValue([
      { id: "d1", name: "Empty", widget_count: null },
    ]);

    const result = await getConnectionUsage("conn-1", "user-1", false, "t-1");

    expect(result.widgetCount).toBe(0);
    expect(result.dashboards[0].widgetCount).toBe(0);
  });

  it("scopes an admin to the tenant, and nothing else", async () => {
    mockExecute.mockResolvedValue([]);

    await getConnectionUsage("conn-1", "admin-1", true, "t-1");

    const { sql: text, params } = ran();
    expect(text).toMatch(/d\.tenant_id = \$\d/);
    expect(params).toContain("t-1");
    expect(text).not.toMatch(/dashboard_share|"userId"|isPublic/);
  });

  it("scopes anyone else to the tenant, and to what they own, are shared on or is public", async () => {
    mockExecute.mockResolvedValue([]);

    await getConnectionUsage("conn-1", "user-1", false, "t-1");

    const { sql: text, params } = ran();
    expect(text).toMatch(/d\.tenant_id = \$\d/);
    expect(text).toMatch(/d\."userId" = \$\d/);
    expect(text).toMatch(/s\."userId" = \$\d/);
    expect(text).toMatch(/dashboard_share/);
    expect(text).toMatch(/"isPublic" = true/);
    expect(params).toEqual(expect.arrayContaining(["t-1", "user-1", "conn-1"]));
  });

  it("coerces string widget_count to number (postgres int8 → string edge case)", async () => {
    mockExecute.mockResolvedValue([
      { id: "d1", name: "A", widget_count: "5" as unknown as number },
    ]);

    const result = await getConnectionUsage("conn-1", "user-1", false, "t-1");

    expect(result.widgetCount).toBe(5);
    expect(result.dashboards[0].widgetCount).toBe(5);
  });
});

describe("getConnectionWidgetCounts", () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it("makes no query for an empty list", async () => {
    expect(await getConnectionWidgetCounts([], "u1", false, "t-1")).toEqual({});
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("counts every listed connection in one query, 0 for a connection no widget uses", async () => {
    mockExecute.mockResolvedValue([
      { connection_id: "c1", widget_count: 14 },
      { connection_id: "c2", widget_count: "6" as unknown as number },
    ]);

    const counts = await getConnectionWidgetCounts(
      ["c1", "c2", "c3"],
      "u1",
      false,
      "t-1",
    );

    expect(counts).toEqual({ c1: 14, c2: 6, c3: 0 });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an admin", true],
    ["anyone else", false],
  ])("scopes %s to the tenant and the listed ids", async (_who, isAdmin) => {
    mockExecute.mockResolvedValue([]);
    await getConnectionWidgetCounts(["c1", "c2"], "u1", isAdmin, "t-1");
    const { sql: text, params } = ran();
    expect(text).toMatch(/d\.tenant_id = \$\d/);
    expect(params).toEqual(expect.arrayContaining(["t-1", "c1", "c2"]));
  });

  it("counts only the dashboards a non-admin can open, all of the tenant's for an admin", async () => {
    mockExecute.mockResolvedValue([]);
    await getConnectionWidgetCounts(["c1"], "u1", true, "t-1");
    await getConnectionWidgetCounts(["c1"], "u1", false, "t-1");
    const admin = ran(0);
    const other = ran(1);
    expect(admin.sql).not.toMatch(/dashboard_share|isPublic|"userId"/);
    expect(other.sql).toMatch(/d\."userId" = \$\d/);
    expect(other.sql).toMatch(/dashboard_share/);
    expect(other.sql).toMatch(/"isPublic" = true/);
    expect(other.params).toContain("u1");
  });
});
