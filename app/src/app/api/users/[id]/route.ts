import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import {
  validateBody,
  forbidden,
  badRequest,
  notFound,
  handleRouteError,
} from "@/lib/api/api-utils";
import { apiSuccess } from "@/lib/api/api-response";
import { auditRequest } from "@/lib/audit/audit";

const updateUserSchema = z
  .object({
    role: z.enum(["admin", "creator", "reader"]).optional(),
    canWrite: z.boolean().optional(),
    disabled: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.role !== undefined ||
      d.canWrite !== undefined ||
      d.disabled !== undefined,
    {
      message: "At least one field must be provided",
    },
  );

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenantId } = await requireAdmin();
    const { id } = await params;

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        canWrite: users.canWrite,
        disabledAt: users.disabledAt,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.id, id), eq(users.tenantId, tenantId)))
      .limit(1);

    if (!user) {
      return notFound("User not found");
    }

    return apiSuccess(user);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, canWrite, tenantId } = await requireAdmin();
    if (!canWrite) return forbidden();
    const { id } = await params;

    if (id === userId) {
      return badRequest("You cannot change your own role");
    }

    const body = await request.json();
    const result = validateBody(updateUserSchema, body);
    if (!result.success) return result.response;

    const updateFields: {
      role?: "admin" | "creator" | "reader";
      canWrite?: boolean;
      disabledAt?: Date | null;
      passwordChangedAt?: Date;
    } = {};
    if (result.data.role !== undefined) updateFields.role = result.data.role;
    if (result.data.canWrite !== undefined)
      updateFields.canWrite = result.data.canWrite;
    if (result.data.disabled !== undefined)
      updateFields.disabledAt = result.data.disabled ? new Date() : null;

    // Invalidate sessions on privilege reduction (demotion)
    if (result.data.role !== undefined) {
      const roleRank: Record<string, number> = {
        admin: 3,
        creator: 2,
        reader: 1,
      };
      const [currentUser] = await db
        .select({ role: users.role })
        .from(users)
        .where(and(eq(users.id, id), eq(users.tenantId, tenantId)))
        .limit(1);
      if (
        currentUser &&
        roleRank[result.data.role] < roleRank[currentUser.role]
      ) {
        updateFields.passwordChangedAt = new Date();
      }
    }

    const [updated] = await db
      .update(users)
      .set(updateFields)
      .where(and(eq(users.id, id), eq(users.tenantId, tenantId)))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        canWrite: users.canWrite,
        disabledAt: users.disabledAt,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      });

    if (!updated) {
      return notFound("User not found");
    }

    auditRequest(request, {
      tenantId,
      userId,
      action: "user.update",
      resourceType: "user",
      resourceId: id,
    });

    // A privilege change is the most audit-relevant event in the product —
    // emit it as its own action so it stays greppable instead of being buried
    // inside a generic user.update.
    if (result.data.role !== undefined || result.data.canWrite !== undefined) {
      auditRequest(request, {
        tenantId,
        userId,
        action: "user.role.change",
        resourceType: "user",
        resourceId: id,
        details: { role: updated.role, canWrite: updated.canWrite },
      });
    }

    return apiSuccess(updated);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, canWrite, tenantId } = await requireAdmin();
    if (!canWrite) return forbidden();
    const { id } = await params;

    if (id === userId) {
      return badRequest("You cannot delete your own account");
    }

    const deleted = await db
      .delete(users)
      .where(and(eq(users.id, id), eq(users.tenantId, tenantId)))
      .returning({ id: users.id });

    if (!deleted.length) {
      return notFound("User not found");
    }

    auditRequest(request, {
      tenantId,
      userId,
      action: "user.disable",
      resourceType: "user",
      resourceId: id,
    });

    return apiSuccess({ deleted: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
