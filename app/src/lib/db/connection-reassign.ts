import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Result of a reassign operation — consumed by the API route and the
 * client-side success toast.
 */
export interface ReassignResult {
  dashboardsUpdated: number;
  widgetsReassigned: number;
}

/**
 * Common WHERE clause that scopes dashboards to ones the caller can
 * actually edit. Non-admins need ownership OR a shared editor/owner
 * role; public read access does NOT grant edit rights.
 */
function editableDashboardsScope(
  userId: string,
  isAdmin: boolean,
  tenantId: string,
) {
  if (isAdmin) {
    return sql`d.tenant_id = ${tenantId}`;
  }
  return sql`
    d.tenant_id = ${tenantId}
    AND (
      d."userId" = ${userId}
      OR EXISTS (
        SELECT 1 FROM "dashboard_share" s
        WHERE s."dashboardId" = d.id
          AND s."userId" = ${userId}
          AND s.tenant_id = ${tenantId}
          AND s.role IN ('editor', 'owner')
      )
    )
  `;
}

/**
 * Count widgets using `fromConnectionId` across editable dashboards.
 * Same scoping rules as reassignConnectionWidgets — what the caller
 * sees here is exactly what will be rewritten.
 */
async function countReassignable(
  fromConnectionId: string,
  userId: string,
  isAdmin: boolean,
  tenantId: string,
): Promise<{ dashboards: number; widgets: number }> {
  const rows = await db.execute<{ dashboards: number; widgets: number }>(
    sql`
      SELECT
        COUNT(DISTINCT d.id)::int AS dashboards,
        COALESCE(SUM(widget_count)::int, 0) AS widgets
      FROM "dashboard" d,
        LATERAL (
          SELECT COUNT(*)::int AS widget_count
          FROM jsonb_array_elements(d."layoutJson"->'pages') AS page,
               jsonb_array_elements(page->'widgets') AS widget
          WHERE widget->>'connectionId' = ${fromConnectionId}
        ) c
      WHERE ${editableDashboardsScope(userId, isAdmin, tenantId)}
        AND widget_count > 0
    `,
  );

  const row = (
    rows as unknown as Array<{ dashboards: number; widgets: number }>
  )[0];
  return {
    dashboards: Number(row?.dashboards ?? 0),
    widgets: Number(row?.widgets ?? 0),
  };
}

/**
 * Walk every dashboard the caller can edit and swap `connectionId` on
 * widgets that match `fromConnectionId` → `toConnectionId`. Returns the
 * number of dashboards touched and the total number of widget slots
 * rewritten.
 *
 * Scoping for editing is narrower than for viewing:
 *   - Admin → every dashboard in the tenant
 *   - Non-admin → dashboards the user owns OR has been shared with an
 *     'editor' or 'owner' role. Public read access does NOT grant edit.
 *
 * Query compatibility is NOT validated here — that's documented in
 * the issue spec (#510). The caller is responsible for enforcing type
 * compatibility between the source and target connections.
 */
export async function reassignConnectionWidgets(
  fromConnectionId: string,
  toConnectionId: string,
  userId: string,
  isAdmin: boolean,
  tenantId: string,
): Promise<ReassignResult> {
  if (fromConnectionId === toConnectionId) {
    return { dashboardsUpdated: 0, widgetsReassigned: 0 };
  }

  // Count before the update — the post-update count is ambiguous if
  // the target already had widgets on it.
  const before = await countReassignable(
    fromConnectionId,
    userId,
    isAdmin,
    tenantId,
  );

  if (before.widgets === 0) {
    return { dashboardsUpdated: 0, widgetsReassigned: 0 };
  }

  // Single UPDATE rewrites layoutJson across all matching dashboards.
  // jsonb_set walks pages → widgets and swaps the connectionId in
  // place when it matches fromConnectionId.
  await db.execute(sql`
    UPDATE "dashboard" d
    SET "layoutJson" = jsonb_set(
      d."layoutJson",
      '{pages}',
      (
        SELECT jsonb_agg(
          jsonb_set(
            page,
            '{widgets}',
            (
              SELECT jsonb_agg(
                CASE
                  WHEN widget->>'connectionId' = ${fromConnectionId}
                  THEN jsonb_set(widget, '{connectionId}', to_jsonb(${toConnectionId}::text))
                  ELSE widget
                END
              )
              FROM jsonb_array_elements(page->'widgets') AS widget
            )
          )
        )
        FROM jsonb_array_elements(d."layoutJson"->'pages') AS page
      )
    )
    WHERE ${editableDashboardsScope(userId, isAdmin, tenantId)}
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(d."layoutJson"->'pages') AS page,
             jsonb_array_elements(page->'widgets') AS widget
        WHERE widget->>'connectionId' = ${fromConnectionId}
      )
  `);

  return {
    dashboardsUpdated: before.dashboards,
    widgetsReassigned: before.widgets,
  };
}
