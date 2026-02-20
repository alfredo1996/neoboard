import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireUserId } from "@/lib/auth/session";
import { encryptJson } from "@/lib/crypto";
import { prefetchSchema } from "@/lib/schema-prefetch";

const updateConnectionSchema = z.object({
  name: z.string().min(1).optional(),
  config: z
    .object({
      uri: z.string().min(1),
      username: z.string().min(1),
      password: z.string().min(1),
      database: z.string().optional(),
    })
    .optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = await request.json();
    const parsed = updateConnectionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name) updates.name = parsed.data.name;
    if (parsed.data.config) updates.configEncrypted = encryptJson(parsed.data.config);

    const [connection] = await db
      .update(connections)
      .set(updates)
      .where(and(eq(connections.id, id), eq(connections.userId, userId)))
      .returning({
        id: connections.id,
        name: connections.name,
        type: connections.type,
        updatedAt: connections.updatedAt,
      });

    if (!connection) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Fire-and-forget: re-warm the schema cache after credential update
    if (parsed.data.config) {
      prefetchSchema(connection.type as "neo4j" | "postgresql", parsed.data.config);
    }

    return NextResponse.json(connection);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update connection";
    if (message.includes("Unauthorized") || message.includes("session")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const result = await db
      .delete(connections)
      .where(and(eq(connections.id, id), eq(connections.userId, userId)))
      .returning({ id: connections.id });

    if (result.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
