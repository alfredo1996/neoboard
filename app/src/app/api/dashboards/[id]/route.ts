import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, users } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import type {
  DashboardLayout,
  DashboardWidget,
  UserRole,
} from "@/lib/db/schema";
import {
  resolveDashboardAccess,
  type DashboardAccessRole,
} from "@/lib/dashboard/access";
import {
  validateBody,
  forbidden,
  notFound,
  handleRouteError,
} from "@/lib/api/api-utils";
import { apiSuccess, apiError } from "@/lib/api/api-response";
import { auditRequest } from "@/lib/audit/audit";
import { sql } from "drizzle-orm";
import {
  layoutConnectionIds,
  unusableByOwner,
  unusableConnectionIds,
} from "@/lib/db/connection-access";
import {
  collectLayoutQueries,
  layoutQueryKey,
} from "@/lib/query/dashboard-query-binding";
import { migrateLayout } from "@/lib/dashboard/migrate-layout";

const gridLayoutItemSchema = z.object({
  i: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const widgetSchema = z
  .object({
    id: z.string(),
    chartType: z.string(),
    connectionId: z.string(),
    query: z.string(),
    params: z.record(z.string(), z.unknown()).optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough(); // preserves templateId, templateSyncedAt and any future fields

const pageSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  widgets: z.array(widgetSchema),
  gridLayout: z.array(gridLayoutItemSchema),
});

const dashboardSettingsSchema = z.object({
  autoRefresh: z.boolean().optional(),
  refreshIntervalSeconds: z.number().min(5).optional(),
});

const updateDashboardSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    layoutJson: z
      .object({
        version: z.literal(2),
        pages: z.array(pageSchema).min(1),
        settings: dashboardSettingsSchema.optional(),
      })
      .optional(),
    isPublic: z.boolean().optional(),
    /** Optimistic lock — must match the server's current version. */
    expectedVersion: z.number().int().positive().optional(),
  })
  // Reject unknown keys (e.g. stale thumbnailJson payloads) instead of
  // silently stripping them into an empty no-op update.
  .strict()
  // Require at least one real data field — expectedVersion alone is just the
  // optimistic-lock guard and has nothing to persist.
  .refine(
    (d) =>
      d.name !== undefined ||
      d.description !== undefined ||
      d.layoutJson !== undefined ||
      d.isPublic !== undefined,
    { message: "At least one field to update is required" },
  );

async function canAccess(
  dashboardId: string,
  userId: string,
  tenantId: string,
  userRole: UserRole,
  requiredRole: "viewer" | "editor" | "owner",
  allowPublic = true,
): Promise<{
  dashboard: typeof dashboards.$inferSelect;
  role: DashboardAccessRole;
} | null> {
  // Delegates to the shared helper (#979) — single source of truth.
  return resolveDashboardAccess({
    dashboardId,
    userId,
    tenantId,
    userRole,
    required: requiredRole,
    allowPublic,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, tenantId, role: userRole } = await requireSession();
    const { id } = await params;

    const access = await canAccess(id, userId, tenantId, userRole, "viewer");
    if (!access) {
      return notFound();
    }

    // Look up the name of the user who last updated this dashboard (tenant-scoped)
    const [metadata] = await db
      .select({ updatedByName: users.name })
      .from(dashboards)
      .leftJoin(users, eq(dashboards.updatedBy, users.id))
      .where(and(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId)))
      .limit(1);

    return apiSuccess({
      ...access.dashboard,
      role: access.role,
      updatedByName: metadata?.updatedByName ?? null,
    });
  } catch (error) {
    return handleRouteError(error, "Failed to fetch dashboard");
  }
}

const CONFLICT_MESSAGE =
  "This dashboard was modified by someone else. Reload to see their changes.";

const FORM_REFUSAL =
  "You can only add or change forms on connections you have access to";

/**
 * The connections of the forms in `next` that the stored layout does not hold
 * as they are: a new form, a widget turned into one, or a form whose query,
 * connection or database changed. Forms match by id, so a copy is new (#1831).
 */
function changedFormConnectionIds(next: unknown, stored: unknown): Set<string> {
  const forms = (layout: unknown) =>
    migrateLayout(layout as DashboardLayout | null)
      .pages.flatMap((page) => page.widgets ?? [])
      .filter((widget) => widget.chartType === "form");
  const key = (form: DashboardWidget) =>
    JSON.stringify([form.id, layoutQueryKey(form)]);
  const kept = new Set(forms(stored).map(key));
  return new Set(
    forms(next)
      .filter((form) => form.connectionId && !kept.has(key(form)))
      .map((form) => form.connectionId),
  );
}

/**
 * Why a save's layout is refused, or null.
 *
 * A dashboard's owner and editors may run any read query on a connection it
 * names while its owner can use that connection (#972), so a save may not add a
 * connection the caller cannot use. One already on the dashboard stays. When
 * the owner cannot use it either, /api/query binds everyone to the saved
 * queries, and that binding reads this layout, so the save may not add a query
 * while such a connection stays on it (#1816). A query is what the binding
 * matches: its connection, text and database, so moving a saved query to
 * another database or connection adds one (#1822).
 *
 * A form writes through its connection for everyone who can open the dashboard
 * (#1831), so adding a form, or changing a form's query, connection or
 * database, needs the caller's own access to that connection, even one already
 * on the dashboard. A form left as stored stays, whoever saves.
 */
async function layoutRefusal(
  next: unknown,
  stored: { layoutJson: unknown; userId: string },
  session: Parameters<typeof unusableConnectionIds>[1],
): Promise<string | null> {
  const storedIds = layoutConnectionIds(stored.layoutJson);
  const storedQueries = collectLayoutQueries(stored.layoutJson);
  const addsQuery = [...collectLayoutQueries(next)].some(
    (query) => !storedQueries.has(query),
  );
  // A save that adds neither a connection nor a query widens no one's access.
  const ids = [...layoutConnectionIds(next)].filter(
    (id) => addsQuery || !storedIds.has(id),
  );
  const formIds = changedFormConnectionIds(next, stored.layoutJson);
  const unusable = await unusableConnectionIds([...ids, ...formIds], session);
  if (unusable.some((id) => formIds.has(id))) return FORM_REFUSAL;
  if (unusable.some((id) => !storedIds.has(id))) {
    return "Widgets can only use connections you have access to";
  }
  const bound =
    unusable.length === 0 || stored.userId === session.userId
      ? unusable
      : await unusableByOwner(unusable, stored.userId, session.tenantId);
  return bound.length > 0
    ? "This dashboard uses a connection you don't have access to, so its queries can't be changed"
    : null;
}

/**
 * Why a save's `isPublic` is refused, or null. Who can open a dashboard is
 * decided like its shares: owner or admin only, the same rule as the share
 * route. Anyone else may re-send the stored value (a stored null counts as
 * false), but it is dropped from `update` rather than written: an update
 * without a layout pins no version, so a copy read before the owner's toggle
 * would otherwise overwrite it.
 */
function publicRefusal(
  update: { isPublic?: boolean },
  access: {
    role: DashboardAccessRole;
    dashboard: Pick<typeof dashboards.$inferSelect, "isPublic">;
  },
): string | null {
  if (
    update.isPublic === undefined ||
    access.role === "owner" ||
    access.role === "admin"
  ) {
    return null;
  }
  if (update.isPublic !== (access.dashboard.isPublic ?? false)) {
    return "Only the dashboard's owner or an admin can change who can open it";
  }
  delete update.isPublic;
  return null;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const {
      userId,
      tenantId,
      role: userRole,
      canWrite,
    } = await requireSession();
    const { id } = await params;

    if (!canWrite) {
      return forbidden();
    }

    const access = await canAccess(id, userId, tenantId, userRole, "editor");
    if (!access) {
      // A user with an explicit VIEWER share gets 403 ("may view, not write"),
      // consistent with the global-reader 403 above — not 404. Exclude public
      // access (allowPublic=false) so a public-but-unshared dashboard still
      // returns 404 and we don't leak per-dashboard writability (#1056).
      const viewAccess = await canAccess(
        id,
        userId,
        tenantId,
        userRole,
        "viewer",
        false,
      );
      return viewAccess ? forbidden() : notFound();
    }

    const body = await request.json();
    const result = validateBody(updateDashboardSchema, body);
    if (!result.success) return result.response;

    const { expectedVersion, ...updateData } = result.data;

    // A save from a stale copy is a conflict first, whatever else it carries
    // (#1816). The version in the update's WHERE below stays the atomic lock.
    if (
      expectedVersion !== undefined &&
      expectedVersion !== access.dashboard.version
    ) {
      return apiError("CONFLICT", CONFLICT_MESSAGE);
    }

    const publicRefused = publicRefusal(updateData, access);
    if (publicRefused) return forbidden(publicRefused);

    if (updateData.layoutJson) {
      const refusal = await layoutRefusal(
        updateData.layoutJson,
        access.dashboard,
        { userId, tenantId, role: userRole },
      );
      if (refusal) return forbidden(refusal);
    }

    // Build WHERE clause — always scope by id + tenant; add version
    // check when the client sends expectedVersion (optimistic lock). A layout
    // is always pinned to the version its checks read, so a save that lands
    // in between makes this a 409 instead of being overwritten (#1831).
    const conditions = [
      eq(dashboards.id, id),
      eq(dashboards.tenantId, tenantId),
    ];
    if (expectedVersion !== undefined || updateData.layoutJson) {
      conditions.push(
        eq(dashboards.version, expectedVersion ?? access.dashboard.version),
      );
    }

    // The schema's .refine() guarantees at least one real data field, so every
    // accepted update is a meaningful edit — always bump version (which drives
    // the "updated by X" banner in other viewers' browsers).
    const [updated] = await db
      .update(dashboards)
      .set({
        ...updateData,
        updatedAt: new Date(),
        updatedBy: userId,
        version: sql`${dashboards.version} + 1`,
      })
      .where(and(...conditions))
      .returning();

    if (!updated) {
      // Row exists (canAccess passed) but version didn't match →
      // another user saved since the client last fetched.
      return apiError("CONFLICT", CONFLICT_MESSAGE);
    }

    auditRequest(request, {
      tenantId,
      userId,
      action: "dashboard.update",
      resourceType: "dashboard",
      resourceId: id,
    });

    return apiSuccess(updated);
  } catch (error) {
    return handleRouteError(error, "Failed to update dashboard");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const {
      userId,
      tenantId,
      role: userRole,
      canWrite,
    } = await requireSession();
    const { id } = await params;

    if (!canWrite) {
      return forbidden();
    }

    // Admin can delete any dashboard in the tenant; Creator only their own
    if (userRole === "admin") {
      const [dashboard] = await db
        .select({ id: dashboards.id })
        .from(dashboards)
        .where(and(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId)))
        .limit(1);

      if (!dashboard) {
        return notFound();
      }
    } else {
      const access = await canAccess(id, userId, tenantId, userRole, "owner");
      if (!access) {
        return notFound();
      }
    }

    await db
      .delete(dashboards)
      .where(and(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId)));

    auditRequest(request, {
      tenantId,
      userId,
      action: "dashboard.delete",
      resourceType: "dashboard",
      resourceId: id,
    });

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete dashboard");
  }
}
