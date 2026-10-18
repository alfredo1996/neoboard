import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Summary of where a connection is used across a user's dashboards.
 * Returned by both the GET /api/connections/{id}/usage endpoint and
 * the 409 response from DELETE /api/connections/{id} when the connection
 * is in use and the caller hasn't passed `?force=true`.
 */
export interface ConnectionUsage {
  widgetCount: number;
  dashboards: Array<{
    id: string;
    name: string;
    widgetCount: number;
  }>;
}

/**
 * Compute how many widgets on how many dashboards reference a given
 * connection, scoped to what the caller can see in their tenant.
 *
 * - **Admin callers** see every dashboard in their tenant. This matches the
 *   existing admin-bypass pattern in `api/dashboards/[id]/route.ts` and is
 *   the conservative answer for a destructive action: admins need the
 *   true blast radius, not a filtered view.
 * - **Non-admin callers** see dashboards they own, ones shared with them,
 *   and public ones within their tenant — mirroring the scoping in
 *   `userHasDashboardAccessToConnection` (api/query/route.ts:142-175).
 *
 * The implementation uses raw SQL with `jsonb_array_elements` because the
 * connection id lives inside the `layoutJson` JSONB column at
 * `pages[].widgets[].connectionId` — there's no relational column to join on.
 * Each dashboard's `widgetCount` is a per-row subquery that counts matching
 * widgets across all pages.
 *
 * Empty result (no widgets reference this connection) returns
 * `{ widgetCount: 0, dashboards: [] }`, not null.
 */
export async function getConnectionUsage(
  connectionId: string,
  userId: string,
  isAdmin: boolean,
  tenantId: string,
): Promise<ConnectionUsage> {
  // The per-row widgetCount subquery is identical in both scoping paths.
  // We only need to vary the outer WHERE clause for admin vs creator.
  const rows = await db.execute<{
    id: string;
    name: string;
    widget_count: number;
  }>(
    isAdmin
      ? sql`
          SELECT
            d.id,
            d.name,
            (
              SELECT COUNT(*)::int
              FROM jsonb_array_elements(d."layoutJson"->'pages') AS page,
                   jsonb_array_elements(page->'widgets') AS widget
              WHERE widget->>'connectionId' = ${connectionId}
            ) AS widget_count
          FROM "dashboard" d
          WHERE d.tenant_id = ${tenantId}
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(d."layoutJson"->'pages') AS page,
                   jsonb_array_elements(page->'widgets') AS widget
              WHERE widget->>'connectionId' = ${connectionId}
            )
          ORDER BY d.name
        `
      : sql`
          SELECT
            d.id,
            d.name,
            (
              SELECT COUNT(*)::int
              FROM jsonb_array_elements(d."layoutJson"->'pages') AS page,
                   jsonb_array_elements(page->'widgets') AS widget
              WHERE widget->>'connectionId' = ${connectionId}
            ) AS widget_count
          FROM "dashboard" d
          WHERE d.tenant_id = ${tenantId}
            AND (
              d."userId" = ${userId}
              OR EXISTS (
                SELECT 1 FROM "dashboard_share" s
                WHERE s."dashboardId" = d.id
                  AND s."userId" = ${userId}
                  AND s.tenant_id = ${tenantId}
              )
              OR d."isPublic" = true
            )
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(d."layoutJson"->'pages') AS page,
                   jsonb_array_elements(page->'widgets') AS widget
              WHERE widget->>'connectionId' = ${connectionId}
            )
          ORDER BY d.name
        `,
  );

  const dashboards = (
    rows as unknown as Array<{ id: string; name: string; widget_count: number }>
  ).map((r) => ({
    id: r.id,
    name: r.name,
    widgetCount: Number(r.widget_count ?? 0),
  }));

  const widgetCount = dashboards.reduce((sum, d) => sum + d.widgetCount, 0);

  return { widgetCount, dashboards };
}

/**
 * How many widgets use each of `connectionIds`, in ONE tenant-scoped pass (the
 * connections list, #2254). Same scoping as `getConnectionUsage`: an admin
 * counts every dashboard of the tenant, anyone else only those they own, are
 * shared on, or that are public. A connection no widget uses reads 0.
 */
export async function getConnectionWidgetCounts(
  connectionIds: string[],
  userId: string,
  isAdmin: boolean,
  tenantId: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const id of connectionIds) counts[id] = 0;
  if (connectionIds.length === 0) return counts;

  const ids = sql.join(
    connectionIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const rows = await db.execute<{
    connection_id: string;
    widget_count: number;
  }>(
    isAdmin
      ? sql`
          SELECT widget->>'connectionId' AS connection_id, COUNT(*)::int AS widget_count
          FROM "dashboard" d,
               jsonb_array_elements(d."layoutJson"->'pages') AS page,
               jsonb_array_elements(page->'widgets') AS widget
          WHERE d.tenant_id = ${tenantId}
            AND widget->>'connectionId' IN (${ids})
          GROUP BY 1
        `
      : sql`
          SELECT widget->>'connectionId' AS connection_id, COUNT(*)::int AS widget_count
          FROM "dashboard" d,
               jsonb_array_elements(d."layoutJson"->'pages') AS page,
               jsonb_array_elements(page->'widgets') AS widget
          WHERE d.tenant_id = ${tenantId}
            AND (
              d."userId" = ${userId}
              OR EXISTS (
                SELECT 1 FROM "dashboard_share" s
                WHERE s."dashboardId" = d.id
                  AND s."userId" = ${userId}
                  AND s.tenant_id = ${tenantId}
              )
              OR d."isPublic" = true
            )
            AND widget->>'connectionId' IN (${ids})
          GROUP BY 1
        `,
  );

  for (const r of rows as unknown as Array<{
    connection_id: string;
    widget_count: number;
  }>) {
    counts[r.connection_id] = Number(r.widget_count ?? 0);
  }
  return counts;
}
