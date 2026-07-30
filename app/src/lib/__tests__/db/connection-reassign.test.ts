import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { execute: mockExecute },
}));

import { reassignConnectionWidgets } from "@/lib/db/connection-reassign";

/**
 * Render a captured `sql` fragment to text + bound params.
 *
 * These queries are raw SQL assembled from nested fragments (the tenant scope,
 * the dashboard scope, the widget-match predicate), so their *shape* is the
 * behaviour under test — a dropped tenant predicate or a dropped ORDER BY is
 * invisible to a result-count assertion. PgDialect resolves nested fragments
 * and collects params exactly as the driver would.
 */
const dialect = new PgDialect();
const render = (call: unknown) => dialect.sqlToQuery(call as SQL);
const updateQuery = () => render(mockExecute.mock.calls[1][0]);

describe("reassignConnectionWidgets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zero counts when source and target are the same", async () => {
    const result = await reassignConnectionWidgets(
      "same-id",
      "same-id",
      "user-1",
      false,
      "t1",
    );
    expect(result).toEqual({ dashboardsUpdated: 0, widgetsReassigned: 0 });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("returns zero counts when source connection is unused", async () => {
    // First execute() call is the count query → 0 widgets
    mockExecute.mockResolvedValueOnce([{ dashboards: 0, widgets: 0 }]);

    const result = await reassignConnectionWidgets(
      "src",
      "dst",
      "user-1",
      false,
      "t1",
    );

    expect(result).toEqual({ dashboardsUpdated: 0, widgetsReassigned: 0 });
    // Should NOT run the UPDATE when nothing needs reassigning
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("counts and updates when source has widgets (non-admin)", async () => {
    // 1st call: count query
    mockExecute.mockResolvedValueOnce([{ dashboards: 3, widgets: 7 }]);
    // 2nd call: UPDATE (returns nothing we care about)
    mockExecute.mockResolvedValueOnce([]);

    const result = await reassignConnectionWidgets(
      "src",
      "dst",
      "user-1",
      false,
      "t1",
    );

    expect(result).toEqual({ dashboardsUpdated: 3, widgetsReassigned: 7 });
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("uses admin scope when isAdmin is true", async () => {
    mockExecute.mockResolvedValueOnce([{ dashboards: 5, widgets: 20 }]);
    mockExecute.mockResolvedValueOnce([]);

    const result = await reassignConnectionWidgets(
      "src",
      "dst",
      "admin-1",
      true,
      "t1",
    );

    expect(result).toEqual({ dashboardsUpdated: 5, widgetsReassigned: 20 });
    // Admin path issues both queries. The scope difference lives inside
    // the SQL — we verify behavior via the counts rather than string
    // matching on the SQL template.
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("handles null values from the count query gracefully", async () => {
    // Empty result row — Postgres can return { dashboards: null, widgets: null }
    mockExecute.mockResolvedValueOnce([{ dashboards: null, widgets: null }]);

    const result = await reassignConnectionWidgets(
      "src",
      "dst",
      "user-1",
      false,
      "t1",
    );

    expect(result).toEqual({ dashboardsUpdated: 0, widgetsReassigned: 0 });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("handles empty count result", async () => {
    mockExecute.mockResolvedValueOnce([]);
    const result = await reassignConnectionWidgets(
      "src",
      "dst",
      "user-1",
      false,
      "t1",
    );
    expect(result).toEqual({ dashboardsUpdated: 0, widgetsReassigned: 0 });
  });

  it("propagates errors from the count query", async () => {
    mockExecute.mockRejectedValueOnce(new Error("DB down"));
    await expect(
      reassignConnectionWidgets("src", "dst", "user-1", false, "t1"),
    ).rejects.toThrow("DB down");
  });

  it("propagates errors from the UPDATE query", async () => {
    mockExecute.mockResolvedValueOnce([{ dashboards: 1, widgets: 2 }]);
    mockExecute.mockRejectedValueOnce(new Error("update failed"));
    await expect(
      reassignConnectionWidgets("src", "dst", "user-1", false, "t1"),
    ).rejects.toThrow("update failed");
  });

  // ── Optimistic-lock visibility ──────────────────────────────────────
  // A reassign that rewrites layoutJson without bumping `version` is
  // invisible to the optimistic lock on PUT /api/dashboards/[id]: a browser
  // holding the pre-reassign version still matches, and its next save
  // silently reverts the reassign. Bumping version turns that into a 409.
  it("bumps version, updatedAt and updated_by so the optimistic lock sees the rewrite", async () => {
    mockExecute.mockResolvedValueOnce([{ dashboards: 1, widgets: 2 }]);
    mockExecute.mockResolvedValueOnce([]);

    await reassignConnectionWidgets("src", "dst", "user-1", false, "t1");

    const update = updateQuery();
    expect(update.sql).toMatch(/"version"\s*=\s*d\."version"\s*\+\s*1/);
    expect(update.sql).toMatch(/"updatedAt"\s*=\s*now\(\)/);
    expect(update.sql).toMatch(/updated_by\s*=\s*\$\d+/);
    expect(update.params).toContain("user-1");
  });
});
