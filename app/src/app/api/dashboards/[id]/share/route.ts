import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboards, dashboardShares, users } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { validateBody, notFound, badRequest, handleRouteError } from "@/lib/api-utils";
import { apiSuccess } from "@/lib/api-response";

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
      return notFound();
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
      .where(
        and(
          eq(dashboardShares.dashboardId, id),
          eq(dashboardShares.tenantId, tenantId),
        )
      );

    return apiSuccess(shares);
  } catch (error) {
    return handleRouteError(error, "Failed to fetch shares");
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
      return notFound();
    }

    const body = await request.json();
    const result = validateBody(shareSchema, body);
    if (!result.success) return result.response;

    // Find user by email
    const [targetUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, result.data.email))
      .limit(1);

    if (!targetUser) {
      return notFound("User not found");
    }

    if (targetUser.id === userId) {
      return badRequest("Cannot share with yourself");
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
        .set({ role: result.data.role })
        .where(eq(dashboardShares.id, existing[0].id));
    } else {
      await db.insert(dashboardShares).values({
        dashboardId: id,
        userId: targetUser.id,
        tenantId,
        role: result.data.role,
      });
    }

    return apiSuccess({ success: true }, 201);
  } catch (error) {
    return handleRouteError(error, "Failed to create share");
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
      return notFound();
    }

    const { searchParams } = new URL(request.url);
    const shareId = searchParams.get("shareId");

    if (!shareId) {
      return badRequest("shareId is required");
    }

    await db
      .delete(dashboardShares)
      .where(
        and(
          eq(dashboardShares.id, shareId),
          eq(dashboardShares.dashboardId, id)
        )
      );

    return apiSuccess({ success: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete share");
  }
}
