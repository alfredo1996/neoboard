import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { badRequest, notFound, handleRouteError } from "@/lib/api-utils";
import { apiSuccess } from "@/lib/api-response";
import { newPasswordSchema } from "@/lib/auth/password-schema";

const resetPasswordSchema = z.object({
  newPassword: newPasswordSchema,
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, canWrite } = await requireAdmin();
    if (!canWrite) throw new Error("Forbidden");
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

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);

    const [updated] = await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, id))
      .returning({ id: users.id });

    if (!updated) {
      return notFound("User not found");
    }

    return apiSuccess({ reset: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
