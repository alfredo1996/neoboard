import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { execute: vi.fn() },
}));

import { db } from "@/lib/db";
import {
  getConnectionUsage,
  getConnectionWidgetCounts,
} from "../connection-usage";

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

  it("uses the admin SQL branch when isAdmin=true (no user-scoped JOIN)", async () => {
    mockExecute.mockResolvedValue([]);

    await getConnectionUsage("conn-1", "admin-1", true, "t-1");

    // Assert on the raw SQL fragment that differs between paths —
    // admin path must not reference dashboard_share or d."userId".
    const sqlArg = mockExecute.mock.calls[0][0];
    const rendered = JSON.stringify(sqlArg);
    expect(rendered).not.toMatch(/dashboard_share/);
    expect(rendered).not.toMatch(/"userId"/);
  });

  it("uses the creator SQL branch when isAdmin=false (includes shared + public scoping)", async () => {
    mockExecute.mockResolvedValue([]);

    await getConnectionUsage("conn-1", "user-1", false, "t-1");

    const sqlArg = mockExecute.mock.calls[0][0];
    const rendered = JSON.stringify(sqlArg);
    // Creator path must include the share-lookup clause and the isPublic branch.
    expect(rendered).toMatch(/dashboard_share/);
    expect(rendered).toMatch(/isPublic/);
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
    const rendered = JSON.stringify(mockExecute.mock.calls[0][0]);
    expect(rendered).toMatch(/tenant_id/);
    for (const v of ["t-1", "c1", "c2"]) expect(rendered).toContain(v);
  });

  it("counts only the dashboards a non-admin can open, all of the tenant's for an admin", async () => {
    mockExecute.mockResolvedValue([]);
    await getConnectionWidgetCounts(["c1"], "u1", true, "t-1");
    await getConnectionWidgetCounts(["c1"], "u1", false, "t-1");
    const [admin, other] = mockExecute.mock.calls.map((c) =>
      JSON.stringify(c[0]),
    );
    expect(admin).not.toMatch(/dashboard_share|isPublic|"userId"/);
    expect(other).toMatch(/dashboard_share/);
    expect(other).toMatch(/isPublic/);
    expect(other).toContain("u1");
  });
});
