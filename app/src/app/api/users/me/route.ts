import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";

/** GET /api/users/me — return current user profile */
export async function GET() {
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

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ data: user });
}

const updateSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

/** PUT /api/users/me — update current user's name */
export async function PUT(req: Request) {
  const session = await requireSession();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 },
    );
  }

  await db
    .update(users)
    .set({ name: parsed.data.name })
    .where(eq(users.id, session.userId));

  return NextResponse.json({ data: { success: true } });
}
