import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { execute: vi.fn() },
}));

import { db } from "@/lib/db";
import { getConnectionUsage } from "../connection-usage";

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
