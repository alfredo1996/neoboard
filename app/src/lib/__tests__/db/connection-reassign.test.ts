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
 * behaviour under test — a dropped tenant predicate or a dropped dashboard
 * filter is invisible to a result-count assertion. PgDialect resolves nested
 * fragments and collects params exactly as the driver would.
 */
const dialect = new PgDialect();
const render = (call: unknown) => dialect.sqlToQuery(call as SQL);
const countQuery = () => render(mockExecute.mock.calls[0][0]);
const updateQuery = () => render(mockExecute.mock.calls[1][0]);

const BASE = {
  fromConnectionId: "src",
  toConnectionId: "dst",
  userId: "user-1",
  isAdmin: false,
  tenantId: "t1",
};

/** Both statements matched something, so the UPDATE runs. */
function mockCount(dashboards = 1, widgets = 2) {
  mockExecute.mockResolvedValueOnce([{ dashboards, widgets }]);
  mockExecute.mockResolvedValueOnce([]);
}

describe("reassignConnectionWidgets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zero counts when source and target are the same", async () => {
    const result = await reassignConnectionWidgets({
      ...BASE,
      fromConnectionId: "same-id",
      toConnectionId: "same-id",
    });
    expect(result).toEqual({ dashboardsUpdated: 0, widgetsReassigned: 0 });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("returns zero counts when source connection is unused", async () => {
    // First execute() call is the count query → 0 widgets
    mockExecute.mockResolvedValueOnce([{ dashboards: 0, widgets: 0 }]);

    const result = await reassignConnectionWidgets(BASE);

    expect(result).toEqual({ dashboardsUpdated: 0, widgetsReassigned: 0 });
    // Should NOT run the UPDATE when nothing needs reassigning
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("counts and updates when source has widgets (non-admin)", async () => {
    mockCount(3, 7);

    const result = await reassignConnectionWidgets(BASE);

    expect(result).toEqual({ dashboardsUpdated: 3, widgetsReassigned: 7 });
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("handles null values from the count query gracefully", async () => {
    // Empty result row — Postgres can return { dashboards: null, widgets: null }
    mockExecute.mockResolvedValueOnce([{ dashboards: null, widgets: null }]);

    const result = await reassignConnectionWidgets(BASE);

    expect(result).toEqual({ dashboardsUpdated: 0, widgetsReassigned: 0 });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("handles empty count result", async () => {
    mockExecute.mockResolvedValueOnce([]);
    const result = await reassignConnectionWidgets(BASE);
    expect(result).toEqual({ dashboardsUpdated: 0, widgetsReassigned: 0 });
  });

  it("propagates errors from the count query", async () => {
    mockExecute.mockRejectedValueOnce(new Error("DB down"));
    await expect(reassignConnectionWidgets(BASE)).rejects.toThrow("DB down");
  });

  it("propagates errors from the UPDATE query", async () => {
    mockExecute.mockResolvedValueOnce([{ dashboards: 1, widgets: 2 }]);
    mockExecute.mockRejectedValueOnce(new Error("update failed"));
    await expect(reassignConnectionWidgets(BASE)).rejects.toThrow(
      "update failed",
    );
  });

  // ── Optimistic-lock visibility ──────────────────────────────────────
  // A reassign that rewrites layoutJson without bumping `version` is
  // invisible to the optimistic lock on PUT /api/dashboards/[id]: a browser
  // holding the pre-reassign version still matches, and its next save
  // silently reverts the reassign. Bumping version turns that into a 409.
  it("bumps version, updatedAt and updated_by so the optimistic lock sees the rewrite", async () => {
    mockCount();

    await reassignConnectionWidgets(BASE);

    const update = updateQuery();
    expect(update.sql).toMatch(/"version"\s*=\s*d\."version"\s*\+\s*1/);
    expect(update.sql).toMatch(/"updatedAt"\s*=\s*now\(\)/);
    expect(update.sql).toMatch(/updated_by\s*=\s*\$\d+/);
    expect(update.params).toContain("user-1");
  });

  // ── Authorization scope (must survive every edit) ────────────────────
  describe("authorization scope", () => {
    it("keeps the tenant predicate and the owner/editor-share branch in both statements", async () => {
      mockCount();

      await reassignConnectionWidgets(BASE);

      for (const q of [countQuery(), updateQuery()]) {
        expect(q.sql).toContain("d.tenant_id = $");
        // `d.id = $x` alone is not authorization — the owner/editor-share
        // check must still gate the raw UPDATE even though the route checks.
        expect(q.sql).toContain('d."userId" = $');
        expect(q.sql).toContain('"dashboard_share"');
        expect(q.sql).toContain("s.role = 'editor'");
        expect(q.params).toContain("t1");
      }
    });

    it("omits the share subquery for admins but keeps the tenant filter", async () => {
      mockCount(5, 20);

      const result = await reassignConnectionWidgets({
        ...BASE,
        userId: "admin-1",
        isAdmin: true,
      });

      expect(result).toEqual({ dashboardsUpdated: 5, widgetsReassigned: 20 });
      for (const q of [countQuery(), updateQuery()]) {
        expect(q.sql).toContain("d.tenant_id = $");
        expect(q.sql).not.toContain('"dashboard_share"');
      }
    });
  });

  // ── Dashboard scope (#1376) ─────────────────────────────────────────
  describe("dashboard scope", () => {
    it("binds dashboardId in BOTH the count and the UPDATE, additively", async () => {
      mockCount();

      await reassignConnectionWidgets({ ...BASE, dashboardId: "dash-1" });

      for (const q of [countQuery(), updateQuery()]) {
        expect(q.sql).toMatch(/AND d\.id = \$\d+/);
        expect(q.params).toContain("dash-1");
        // Additive, never a replacement for the editable-dashboards scope.
        expect(q.sql).toContain("d.tenant_id = $");
        expect(q.sql).toContain('d."userId" = $');
      }
    });

    it("emits no dashboard filter when unscoped (global reassign)", async () => {
      mockCount();

      await reassignConnectionWidgets(BASE);

      for (const q of [countQuery(), updateQuery()]) {
        expect(q.sql).not.toMatch(/AND d\.id = \$\d+/);
        expect(q.params).not.toContain("dash-1");
      }
    });
  });

  // ── Empty source = "unassigned and needs a connector" (#1377) ────────
  describe("empty source", () => {
    it("matches NULL-or-empty connectionId and excludes content-only widgets", async () => {
      mockCount();

      await reassignConnectionWidgets({
        ...BASE,
        fromConnectionId: "",
        dashboardId: "dash-1",
      });

      for (const q of [countQuery(), updateQuery()]) {
        // `widget->>'connectionId' = ''` is NULL-blind: a widget with no
        // connectionId key at all yields NULL, not true. COALESCE fixes it.
        expect(q.sql).toMatch(/COALESCE\(widget->>'connectionId', ''\) = ''/);
        // `""` is overloaded — dashboard-export rewrites markdown/iframe
        // widgets to connectionId:"" too, so they must be excluded or a
        // bulk assign stamps a connector onto text widgets.
        expect(q.sql).toMatch(/widget->>'chartType' NOT IN \(\$\d+, \$\d+\)/);
        expect(q.params).toContain("markdown");
        expect(q.params).toContain("iframe");
      }
    });

    it("does not fire the from === to early return for an empty source", async () => {
      mockCount();

      const result = await reassignConnectionWidgets({
        ...BASE,
        fromConnectionId: "",
        toConnectionId: "c1",
      });

      expect(result).toEqual({ dashboardsUpdated: 1, widgetsReassigned: 2 });
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it("uses plain equality for a real source — no COALESCE, no chartType filter", async () => {
      mockCount();

      await reassignConnectionWidgets(BASE);

      for (const q of [countQuery(), updateQuery()]) {
        expect(q.sql).toContain("widget->>'connectionId' = $");
        expect(q.sql).not.toContain("COALESCE(widget->>'connectionId'");
        expect(q.sql).not.toContain("chartType");
        expect(q.params).not.toContain("markdown");
      }
    });
  });

  // ── Structural invariants of the jsonb rebuild ──────────────────────
  // The UPDATE rebuilds `pages` wholesale; three things there are the only
  // reason it is not destructive. A refactor that drops any of them corrupts
  // dashboards silently, so they are asserted rather than trusted.
  it("preserves page order, the empty-widgets COALESCE, and the non-empty-pages guard", async () => {
    mockCount();

    await reassignConnectionWidgets(BASE);
    const { sql: text } = updateQuery();

    // jsonb_agg over a function scan is unordered without this.
    expect(text).toContain("WITH ORDINALITY");
    expect(text).toContain("ORDER BY page_ord");
    // jsonb_agg over an empty array returns NULL and jsonb_set is strict, so
    // a page with zero widgets would NULL the whole layoutJson.
    expect(text).toContain("'[]'::jsonb");
    // Guarantees `pages` is non-empty so the outer jsonb_agg cannot return
    // NULL and wipe the column.
    expect(text).toContain("AND EXISTS (");
  });
});
