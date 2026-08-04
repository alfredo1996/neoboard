import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { CONTENT_ONLY_CHART_TYPES } from "@/lib/widget/content-only-chart";

/**
 * Result of a reassign operation — consumed by the API route and the
 * client-side success toast.
 */
export interface ReassignResult {
  dashboardsUpdated: number;
  widgetsReassigned: number;
}

export interface ReassignOptions {
  /**
   * Source connection. The empty string means "widgets that have no connection
   * and need one" — the post-import gap from #1377, where a skipped connection
   * leaves `connectionId: ""`. Not a real id, so no type check is possible.
   */
  fromConnectionId: string;
  toConnectionId: string;
  /**
   * Restrict the rewrite to a single dashboard (#1376). Omitted = every
   * dashboard the caller can edit, which is the original global behaviour.
   */
  dashboardId?: string;
  userId: string;
  isAdmin: boolean;
  tenantId: string;
}

/**
 * Common WHERE clause that scopes dashboards to ones the caller can
 * actually edit. Non-admins need ownership OR a shared editor role;
 * public read access does NOT grant edit rights.
 *
 * Never collapse this into "id + tenant" when a dashboardId is supplied:
 * `d.id = $x` is a filter, not an authorization check.
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
          AND s.role = 'editor'
      )
    )
  `;
}

/**
 * Optional single-dashboard narrowing, ADDITIVE to editableDashboardsScope —
 * it never replaces it. Empty fragment when unscoped.
 */
function dashboardScope(dashboardId: string | undefined): SQL {
  return dashboardId ? sql`AND d.id = ${dashboardId}` : sql``;
}

/**
 * Does a `widget` (the jsonb_array_elements alias) reference the source?
 *
 * Extracted because this predicate appears three times — the count's LATERAL,
 * the UPDATE's CASE, and the UPDATE's EXISTS guard — and all three must agree
 * exactly or the reported count won't match what was rewritten.
 *
 * Two modes:
 *   - a real connection id → plain equality
 *   - `""` → "unassigned and needs a connector", which is subtler:
 *       * `widget->>'connectionId' = ''` is NULL-blind. A widget with no
 *         `connectionId` key at all yields NULL, not true, so it would be
 *         skipped. COALESCE folds missing and empty into the same bucket.
 *       * `""` is OVERLOADED: dashboard-export.ts rewrites content-only
 *         widgets (markdown, iframe) to `connectionId: ""` as well, so the
 *         empty bucket holds both import-skipped widgets and text widgets that
 *         never wanted a connection. Without the exclusion, a bulk assign
 *         stamps a connector onto markdown.
 *       * `NOT IN` evaluates to NULL when `chartType` is absent, so a widget
 *         with no chartType is SKIPPED rather than stamped. That is the
 *         fail-safe direction and is deliberate: never write to a widget we
 *         cannot classify.
 */
function widgetMatchesSource(fromConnectionId: string): SQL {
  if (fromConnectionId !== "") {
    return sql`widget->>'connectionId' = ${fromConnectionId}`;
  }
  return sql`
    COALESCE(widget->>'connectionId', '') = ''
    AND widget->>'chartType' NOT IN (${sql.join(
      CONTENT_ONLY_CHART_TYPES.map((t) => sql`${t}`),
      sql`, `,
    )})
  `;
}

/**
 * Count widgets matching the source across editable dashboards.
 * Same scoping rules as reassignConnectionWidgets — what the caller
 * sees here is exactly what will be rewritten.
 */
async function countReassignable(
  opts: ReassignOptions,
): Promise<{ dashboards: number; widgets: number }> {
  const { fromConnectionId, dashboardId, userId, isAdmin, tenantId } = opts;

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
          WHERE ${widgetMatchesSource(fromConnectionId)}
        ) c
      WHERE ${editableDashboardsScope(userId, isAdmin, tenantId)}
        ${dashboardScope(dashboardId)}
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
 * Walk every dashboard the caller can edit — or just `dashboardId`, when given
 * — and swap `connectionId` on widgets matching the source. Returns the number
 * of dashboards touched and the total number of widget slots rewritten.
 *
 * Scoping for editing is narrower than for viewing:
 *   - Admin → every dashboard in the tenant
 *   - Non-admin → dashboards the user owns OR has been shared with an
 *     'editor' role. Public read access does NOT grant edit.
 *
 * Query compatibility is NOT validated here — that's documented in
 * the issue spec (#510). The caller is responsible for enforcing type
 * compatibility between the source and target connections.
 */
export async function reassignConnectionWidgets(
  opts: ReassignOptions,
): Promise<ReassignResult> {
  const { fromConnectionId, toConnectionId, dashboardId, userId } = opts;

  if (fromConnectionId === toConnectionId) {
    return { dashboardsUpdated: 0, widgetsReassigned: 0 };
  }

  // Count before the update — the post-update count is ambiguous if
  // the target already had widgets on it.
  const before = await countReassignable(opts);

  if (before.widgets === 0) {
    return { dashboardsUpdated: 0, widgetsReassigned: 0 };
  }

  const match = widgetMatchesSource(fromConnectionId);

  // Single UPDATE rewrites layoutJson across all matching dashboards.
  // jsonb_set walks pages → widgets and swaps the connectionId in
  // place when it matches the source.
  //
  // Three things in the rebuild are load-bearing:
  //   - WITH ORDINALITY + ORDER BY page_ord is the ONLY thing preserving page
  //     order; jsonb_agg over a function scan is otherwise unordered.
  //   - COALESCE(..., '[]'::jsonb) exists because jsonb_agg over an empty
  //     array returns NULL and jsonb_set is strict, so a page with zero
  //     widgets would NULL the entire layoutJson.
  //   - the WHERE EXISTS guarantees `pages` is non-empty, so the outer
  //     jsonb_agg cannot return NULL and wipe the column.
  //
  // `version`/`updatedAt`/`updated_by` are bumped alongside layoutJson because
  // PUT /api/dashboards/[id] bumps all three and clients send `expectedVersion`
  // as an optimistic lock. Rewriting layoutJson alone leaves an open editor
  // holding a still-matching version, so its next save silently REVERTS the
  // reassign. Bumping turns that lost write into the 409 it should have been.
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
            COALESCE(
              (
                SELECT jsonb_agg(
                  CASE
                    WHEN ${match}
                    THEN jsonb_set(widget, '{connectionId}', to_jsonb(${toConnectionId}::text))
                    ELSE widget
                  END
                )
                FROM jsonb_array_elements(page->'widgets') AS widget
              ),
              '[]'::jsonb
            )
          )
          ORDER BY page_ord
        )
        FROM jsonb_array_elements(d."layoutJson"->'pages') WITH ORDINALITY AS t(page, page_ord)
      )
    ),
      -- Bumping version is what makes the rewrite visible to the optimistic
      -- lock -- see the note above db.execute.
      "version" = d."version" + 1,
      "updatedAt" = now(),
      updated_by = ${userId}
    WHERE ${editableDashboardsScope(userId, opts.isAdmin, opts.tenantId)}
      ${dashboardScope(dashboardId)}
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(d."layoutJson"->'pages') AS page,
             jsonb_array_elements(page->'widgets') AS widget
        WHERE ${match}
      )
  `);

  return {
    dashboardsUpdated: before.dashboards,
    widgetsReassigned: before.widgets,
  };
}
