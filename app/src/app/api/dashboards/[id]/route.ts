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

/** Each thumbnail must be a data-URI under 50 KB. */
const thumbnailValueSchema = z.string().startsWith("data:image/").max(50_000);

const updateDashboardSchema = z.object({
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
  thumbnailJson: z.record(thumbnailValueSchema).optional(),
  /** Optimistic lock — must match the server's current version. */
  expectedVersion: z.number().int().positive().optional(),
});

async function canAccess(
  dashboardId: string,
  userId: string,
  tenantId: string,
  userRole: UserRole,
  requiredRole: "viewer" | "editor" | "owner",
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
      return notFound();
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

    // Only increment version on meaningful edits — thumbnails-only or
    // settings-only saves should not bump version and trigger the
    // "updated by X" banner in other viewers' browsers.
    const isMeaningfulEdit =
      expectedVersion !== undefined ||
      updateData.layoutJson !== undefined ||
      updateData.name !== undefined ||
      updateData.description !== undefined ||
      updateData.isPublic !== undefined;

    const [updated] = await db
      .update(dashboards)
      .set({
        ...updateData,
        updatedAt: new Date(),
        updatedBy: userId,
        ...(isMeaningfulEdit
          ? { version: sql`${dashboards.version} + 1` }
          : {}),
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
