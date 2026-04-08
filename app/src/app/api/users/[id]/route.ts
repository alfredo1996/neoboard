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
    } = {};
    if (result.data.role !== undefined) updateFields.role = result.data.role;
    if (result.data.canWrite !== undefined)
      updateFields.canWrite = result.data.canWrite;
    if (result.data.disabled !== undefined)
      updateFields.disabledAt = result.data.disabled ? new Date() : null;

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

    return apiSuccess(updated);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(
  _request: Request,
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

    return apiSuccess({ deleted: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
