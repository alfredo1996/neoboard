import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";

const updateUserSchema = z
  .object({
    role: z.enum(["admin", "creator", "reader"]).optional(),
    canWrite: z.boolean().optional(),
  })
  .refine((d) => d.role !== undefined || d.canWrite !== undefined, {
    message: "At least one field must be provided",
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAdmin();
    const { id } = await params;

    if (id === userId) {
      return NextResponse.json(
        { error: "You cannot change your own role" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const updateFields: { role?: "admin" | "creator" | "reader"; canWrite?: boolean } = {};
    if (parsed.data.role !== undefined) updateFields.role = parsed.data.role;
    if (parsed.data.canWrite !== undefined) updateFields.canWrite = parsed.data.canWrite;

    const [updated] = await db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        canWrite: users.canWrite,
        createdAt: users.createdAt,
      });

    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (e) {
    const status = e instanceof Error && e.message === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAdmin();
    const { id } = await params;

    if (id === userId) {
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
  } catch (e) {
    const status = e instanceof Error && e.message === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status });
  }
}
