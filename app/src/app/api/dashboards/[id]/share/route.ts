import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, dashboardShares, users } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";

const shareSchema = z.object({
  email: z.string().email(),
  role: z.enum(["viewer", "editor"]),
});

/**
 * Verify the caller has permission to manage shares for this dashboard.
 * Admin can manage any dashboard in the tenant; others must own it.
 */
async function requireShareAccess(
  dashboardId: string,
  userId: string,
  isAdmin: boolean,
  tenantId: string
) {
  if (isAdmin) {
    const [dashboard] = await db
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, dashboardId), eq(dashboards.tenantId, tenantId)))
      .limit(1);
    return dashboard ?? null;
  }

  const [dashboard] = await db
    .select()
    .from(dashboards)
    .where(
      and(
        eq(dashboards.id, dashboardId),
        eq(dashboards.userId, userId),
        eq(dashboards.tenantId, tenantId)
      )
    )
    .limit(1);

  return dashboard ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, role, tenantId } = await requireSession();
    const { id } = await params;

    const dashboard = await requireShareAccess(id, userId, role === "admin", tenantId);
    if (!dashboard) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const shares = await db
      .select({
        id: dashboardShares.id,
        role: dashboardShares.role,
        createdAt: dashboardShares.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(dashboardShares)
      .innerJoin(users, eq(dashboardShares.userId, users.id))
      .where(eq(dashboardShares.dashboardId, id));

    return NextResponse.json(shares);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, role, tenantId } = await requireSession();
    const { id } = await params;

    const dashboard = await requireShareAccess(id, userId, role === "admin", tenantId);
    if (!dashboard) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = shareSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    // Find user by email
    const [targetUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetUser.id === userId) {
      return NextResponse.json(
        { error: "Cannot share with yourself" },
        { status: 400 }
      );
    }

    // Upsert share
    const existing = await db
      .select()
      .from(dashboardShares)
      .where(
        and(
          eq(dashboardShares.dashboardId, id),
          eq(dashboardShares.userId, targetUser.id)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(dashboardShares)
        .set({ role: parsed.data.role })
        .where(eq(dashboardShares.id, existing[0].id));
    } else {
      await db.insert(dashboardShares).values({
        dashboardId: id,
        userId: targetUser.id,
        tenantId,
        role: parsed.data.role,
      });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, role, tenantId } = await requireSession();
    const { id } = await params;

    const dashboard = await requireShareAccess(id, userId, role === "admin", tenantId);
    if (!dashboard) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const shareId = searchParams.get("shareId");

    if (!shareId) {
      return NextResponse.json(
        { error: "shareId is required" },
        { status: 400 }
      );
    }

    await db
      .delete(dashboardShares)
      .where(
        and(
          eq(dashboardShares.id, shareId),
          eq(dashboardShares.dashboardId, id)
        )
      );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
