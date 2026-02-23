import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";

const updateRoleSchema = z.object({
  role: z.enum(["admin", "creator", "reader"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: currentUserId, role: callerRole } = await requireSession();
    const { id } = await params;

    if (callerRole !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (id === currentUserId) {
      return NextResponse.json(
        { error: "You cannot change your own role" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateRoleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(users)
      .set({ role: parsed.data.role })
      .where(eq(users.id, id))
      .returning({ id: users.id, role: users.role });

    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: currentUserId } = await requireSession();
    const { id } = await params;

    if (id === currentUserId) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    const deleted = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning({ id: users.id });

    if (!deleted.length) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
