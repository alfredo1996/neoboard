import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { validateBody, handleRouteError } from "@/lib/api-utils";

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["admin", "creator", "reader"]).optional().default("creator"),
  canWrite: z.boolean().optional().default(true),
});

export async function GET() {
  try {
    await requireAdmin();

    const result = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        canWrite: users.canWrite,
        createdAt: users.createdAt,
      })
      .from(users);

    return NextResponse.json(result);
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
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
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

    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
