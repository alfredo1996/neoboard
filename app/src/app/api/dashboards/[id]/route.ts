import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, dashboardShares } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import type { UserRole } from "@/lib/db/schema";
import { validateBody, forbidden, notFound, handleRouteError } from "@/lib/api-utils";

const gridLayoutItemSchema = z.object({
  i: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const widgetSchema = z.object({
  id: z.string(),
  chartType: z.string(),
  connectionId: z.string(),
  query: z.string(),
  params: z.record(z.unknown()).optional(),
  settings: z.record(z.unknown()).optional(),
}).passthrough(); // preserves templateId, templateSyncedAt and any future fields

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
const thumbnailValueSchema = z.string()
  .startsWith("data:image/")
  .max(50_000);

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
});

type DashboardAccessRole = "owner" | "editor" | "viewer" | "admin";

async function canAccess(
  dashboardId: string,
  userId: string,
  tenantId: string,
  userRole: UserRole,
  requiredRole: "viewer" | "editor" | "owner"
): Promise<{
  dashboard: typeof dashboards.$inferSelect;
  role: DashboardAccessRole;
} | null> {
  const [dashboard] = await db
    .select()
    .from(dashboards)
    .where(and(eq(dashboards.id, dashboardId), eq(dashboards.tenantId, tenantId)))
    .limit(1);

  if (!dashboard) return null;

  // Admins bypass per-dashboard ACL
  if (userRole === "admin") return { dashboard, role: "admin" };

  if (dashboard.userId === userId) return { dashboard, role: "owner" };

  const [share] = await db
    .select()
    .from(dashboardShares)
    .where(
      and(
        eq(dashboardShares.dashboardId, dashboardId),
        eq(dashboardShares.userId, userId),
        eq(dashboardShares.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!share) {
    // Public dashboards grant read-only access to any authenticated tenant user
    if (dashboard.isPublic && requiredRole === "viewer") {
      return { dashboard, role: "viewer" as const };
    }
    return null;
  }

  if (requiredRole === "owner") return null;
  if (requiredRole === "editor" && share.role === "viewer") return null;

  return { dashboard, role: share.role };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, tenantId, role: userRole } = await requireSession();
    const { id } = await params;

    const access = await canAccess(id, userId, tenantId, userRole, "viewer");
    if (!access) {
      return notFound();
    }

    return NextResponse.json({ ...access.dashboard, role: access.role });
  } catch (error) {
    return handleRouteError(error, "Failed to fetch dashboard");
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, tenantId, role: userRole } = await requireSession();
    const { id } = await params;

    if (userRole === "reader") {
      return forbidden();
    }

    const access = await canAccess(id, userId, tenantId, userRole, "editor");
    if (!access) {
      return notFound();
    }

    const body = await request.json();
    const result = validateBody(updateDashboardSchema, body);
    if (!result.success) return result.response;

    const [updated] = await db
      .update(dashboards)
      .set({ ...result.data, updatedAt: new Date() })
      .where(and(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId)))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error, "Failed to update dashboard");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, tenantId, role: userRole } = await requireSession();
    const { id } = await params;

    if (userRole === "reader") {
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

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete dashboard");
  }
}
