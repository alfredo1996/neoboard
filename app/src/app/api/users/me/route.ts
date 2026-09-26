import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { auditRequest } from "@/lib/audit/audit";
import {
  handleRouteError,
  notFound,
  readJsonBody,
  validateBody,
} from "@/lib/api/api-utils";
import { apiSuccess } from "@/lib/api/api-response";

/** GET /api/users/me — return current user profile */
export async function GET() {
  try {
    const session = await requireSession();

    const user = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        canWrite: users.canWrite,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!user) return notFound("User not found");

    return apiSuccess(user);
  } catch (e) {
    return handleRouteError(e);
  }
}

const updateSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

/** PUT /api/users/me — update current user's name */
export async function PUT(req: Request) {
  try {
    const session = await requireSession();

    const validation = validateBody(updateSchema, await readJsonBody(req));
    if (!validation.success) return validation.response;

    await db
      .update(users)
      .set({ name: validation.data.name })
      .where(eq(users.id, session.userId));

    auditRequest(req, {
      tenantId: session.tenantId,
      userId: session.userId,
      action: "user.profile.update",
      resourceType: "user",
      resourceId: session.userId,
      details: { fields: Object.keys(validation.data) },
    });

    return apiSuccess({ success: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
