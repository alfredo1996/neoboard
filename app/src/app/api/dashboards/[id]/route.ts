import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, dashboardShares } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import type { UserRole } from "@/lib/db/schema";

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
});

const pageSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  widgets: z.array(widgetSchema),
  gridLayout: z.array(gridLayoutItemSchema),
});

const updateDashboardSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  layoutJson: z
    .object({
      version: z.literal(2),
      pages: z.array(pageSchema).min(1),
    })
    .optional(),
  isPublic: z.boolean().optional(),
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

  if (!share) return null;

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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ...access.dashboard, role: access.role });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const access = await canAccess(id, userId, tenantId, userRole, "editor");
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateDashboardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(dashboards)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId)))
      .returning();

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Admin can delete any dashboard in the tenant; Creator only their own
    if (userRole === "admin") {
      const [dashboard] = await db
        .select({ id: dashboards.id })
        .from(dashboards)
        .where(and(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId)))
        .limit(1);

      if (!dashboard) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    } else {
      const access = await canAccess(id, userId, tenantId, userRole, "owner");
      if (!access) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    await db
      .delete(dashboards)
      .where(and(eq(dashboards.id, id), eq(dashboards.tenantId, tenantId)));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
