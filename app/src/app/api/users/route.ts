import { z } from "zod";
import { count, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { validateBody, handleRouteError } from "@/lib/api-utils";
import { apiSuccess, apiList, apiError, parsePagination } from "@/lib/api-response";

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["admin", "creator", "reader"]).optional().default("creator"),
  canWrite: z.boolean().optional().default(true),
});

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { limit, offset } = parsePagination(request);

    const [{ count: total }] = await db
      .select({ count: count() })
      .from(users);

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        canWrite: users.canWrite,
        createdAt: users.createdAt,
      })
      .from(users)
      .limit(limit)
      .orderBy(users.createdAt)
      .offset(offset);

    return apiList(rows, { total: Number(total), limit, offset });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const body = await request.json();
    const result = validateBody(createUserSchema, body);
    if (!result.success) return result.response;

    const { name, email, password, role, canWrite } = result.data;

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return apiError("CONFLICT", "A user with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await db
      .insert(users)
      .values({ name, email, passwordHash, role, canWrite })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        canWrite: users.canWrite,
        createdAt: users.createdAt,
      });

    return apiSuccess(user, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
