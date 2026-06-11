import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dashboardShares, users } from "@/lib/db/schema";
import { resolveDashboardAccess } from "@/lib/dashboard/access";
import { requireSession } from "@/lib/auth/session";
import {
  validateBody,
  notFound,
  badRequest,
  handleRouteError,
} from "@/lib/api/api-utils";
import { apiSuccess } from "@/lib/api/api-response";

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
  tenantId: string,
) {
  // Managing shares requires owner (or admin) level — delegate to the
  // shared ACL helper (#979). userRole "admin" makes isAdmin redundant
  // but we keep the param for call-site compatibility.
  const access = await resolveDashboardAccess({
    dashboardId,
    userId,
    tenantId,
    userRole: isAdmin ? "admin" : "creator",
    required: "owner",
  });
  return access?.dashboard ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, role, tenantId } = await requireSession();
    const { id } = await params;

    const dashboard = await requireShareAccess(
      id,
      userId,
      role === "admin",
      tenantId,
    );
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
        ),
      );

    return apiSuccess(shares);
  } catch (error) {
    return handleRouteError(error, "Failed to fetch shares");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, role, tenantId } = await requireSession();
    const { id } = await params;

    const dashboard = await requireShareAccess(
      id,
      userId,
      role === "admin",
      tenantId,
    );
    if (!dashboard) {
      return notFound();
    }

    const body = await request.json();
    const result = validateBody(shareSchema, body);
    if (!result.success) return result.response;

    // Find user by email within same tenant
    const [targetUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.email, result.data.email), eq(users.tenantId, tenantId)),
      )
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
          eq(dashboardShares.userId, targetUser.id),
        ),
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, role, tenantId } = await requireSession();
    const { id } = await params;

    const dashboard = await requireShareAccess(
      id,
      userId,
      role === "admin",
      tenantId,
    );
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
          eq(dashboardShares.dashboardId, id),
          eq(dashboardShares.tenantId, tenantId),
        ),
      );

    return apiSuccess({ success: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete share");
  }
}
