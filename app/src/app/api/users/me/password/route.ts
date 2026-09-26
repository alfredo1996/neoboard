import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { auditRequest } from "@/lib/audit/audit";
import { unstable_update } from "@/lib/auth/config";
import { newPasswordSchema } from "@/lib/auth/password-schema";
import {
  forbidden,
  handleRouteError,
  notFound,
  readJsonBody,
  validateBody,
} from "@/lib/api/api-utils";
import { apiSuccess } from "@/lib/api/api-response";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: newPasswordSchema,
});

export async function PUT(req: Request) {
  try {
    const session = await requireSession();

    const validation = validateBody(passwordSchema, await readJsonBody(req));
    if (!validation.success) return validation.response;

    const { currentPassword, newPassword } = validation.data;

    // Fetch the user's current password hash
    const user = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!user?.passwordHash) {
      return notFound("User not found or has no password");
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) return forbidden("Current password is incorrect");

    // Hash and update — also clear forcePasswordChange so the user is no longer redirected
    const newHash = await bcrypt.hash(newPassword, 12);
    await db
      .update(users)
      .set({
        passwordHash: newHash,
        forcePasswordChange: false,
        passwordChangedAt: new Date(),
      })
      .where(eq(users.id, session.userId));

    auditRequest(req, {
      tenantId: session.tenantId,
      userId: session.userId,
      action: "user.password.change",
      resourceType: "user",
      resourceId: session.userId,
      // Never the password — current, new, or hashed.
    });

    // Re-issue the session cookie in this response. The proxy decodes the raw
    // JWT cookie (getToken never hits the DB), so without this the stale
    // forcePasswordChange=true claim bounces the user straight back to
    // /change-password after the redirect. The jwt callback re-fetches the
    // user from the DB, so an empty update is enough to refresh every claim.
    try {
      await unstable_update({});
    } catch {
      // Best-effort: the password change itself succeeded. The cookie will
      // refresh on the next session poll.
    }

    return apiSuccess({ success: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
