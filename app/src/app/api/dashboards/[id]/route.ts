import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, dashboardShares } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import type { UserRole } from "@/lib/db/schema";

const updateDashboardSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  layoutJson: z
    .object({
      widgets: z.array(z.any()),
      gridLayout: z.array(z.any()),
    })
    .optional(),
  isPublic: z.boolean().optional(),
});

type DashboardAccessRole = "owner" | "editor" | "viewer" | "admin";

async function canAccess(
  dashboardId: string,
  userId: string,
  userRole: UserRole,
  requiredRole: "viewer" | "editor" | "owner"
): Promise<{
  dashboard: typeof dashboards.$inferSelect;
  role: DashboardAccessRole;
} | null> {
  const [dashboard] = await db
    .select()
    .from(dashboards)
    .where(eq(dashboards.id, dashboardId))
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
        eq(dashboardShares.userId, userId)
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
    const { userId, role: userRole } = await requireSession();
    const { id } = await params;

    const access = await canAccess(id, userId, userRole, "viewer");
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
    const { userId, role: userRole } = await requireSession();
    const { id } = await params;

    if (userRole === "reader") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const access = await canAccess(id, userId, userRole, "editor");
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
      .where(eq(dashboards.id, id))
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
    const { userId, role: userRole } = await requireSession();
    const { id } = await params;

    if (userRole === "reader") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Admin can delete any dashboard; Creator only their own
    if (userRole === "admin") {
      const [dashboard] = await db
        .select({ id: dashboards.id })
        .from(dashboards)
        .where(eq(dashboards.id, id))
        .limit(1);

      if (!dashboard) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    } else {
      const access = await canAccess(id, userId, userRole, "owner");
      if (!access) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    await db.delete(dashboards).where(eq(dashboards.id, id));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
