import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, users } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import type { UserRole } from "@/lib/db/schema";
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
import { sql } from "drizzle-orm";

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
    params: z.record(z.unknown()).optional(),
    settings: z.record(z.unknown()).optional(),
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

    // Build WHERE clause — always scope by id + tenant; add version
    // check when the client sends expectedVersion (optimistic lock).
    const conditions = [
      eq(dashboards.id, id),
      eq(dashboards.tenantId, tenantId),
    ];
    if (expectedVersion !== undefined) {
      conditions.push(eq(dashboards.version, expectedVersion));
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
      return apiError(
        "CONFLICT",
        "This dashboard was modified by someone else. Reload to see their changes.",
      );
    }

    return apiSuccess(updated);
  } catch (error) {
    return handleRouteError(error, "Failed to update dashboard");
  }
}

export async function DELETE(
  _request: Request,
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

    return apiSuccess({ deleted: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete dashboard");
  }
}
