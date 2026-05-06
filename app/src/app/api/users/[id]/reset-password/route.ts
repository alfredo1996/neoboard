import { z } from "zod";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import {
  forbidden,
  badRequest,
  notFound,
  handleRouteError,
} from "@/lib/api/api-utils";
import { apiSuccess } from "@/lib/api/api-response";
import { newPasswordSchema } from "@/lib/auth/password-schema";

const resetPasswordSchema = z
  .object({
    newPassword: newPasswordSchema.optional(),
    generatePassword: z.boolean().optional().default(false),
    forcePasswordChange: z.boolean().optional().default(false),
  })
  .refine((d) => d.newPassword || d.generatePassword, {
    message: "Either newPassword or generatePassword must be provided",
  });

/** Generate a cryptographically random temporary password. */
function generateTempPassword(length = 16): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, canWrite, tenantId } = await requireAdmin();
    if (!canWrite) return forbidden();
    const { id } = await params;

    if (id === userId) {
      return badRequest(
        "Use the password change endpoint to change your own password",
      );
    }

    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.errors[0].message);
    }

    const password = parsed.data.newPassword ?? generateTempPassword();
    const passwordHash = await bcrypt.hash(password, 12);

    const updateFields: Record<string, unknown> = {
      passwordHash,
      passwordChangedAt: new Date(),
    };
    if (parsed.data.forcePasswordChange) {
      updateFields.forcePasswordChange = true;
    }

    const [updated] = await db
      .update(users)
      .set(updateFields)
      .where(and(eq(users.id, id), eq(users.tenantId, tenantId)))
      .returning({ id: users.id });

    if (!updated) {
      return notFound("User not found");
    }

    return apiSuccess({
      reset: true,
      ...(parsed.data.generatePassword ? { generatedPassword: password } : {}),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
