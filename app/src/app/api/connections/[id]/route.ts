import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireUserId } from "@/lib/auth/session";
import { encryptJson } from "@/lib/crypto";
import { prefetchSchema } from "@/lib/schema-prefetch";
import { updateConnectionSchema } from "@/lib/schemas";
import { validateBody, notFound, handleRouteError } from "@/lib/api-utils";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = await request.json();
    const result = validateBody(updateConnectionSchema, body);
    if (!result.success) return result.response;

    const updates: Record<string, unknown> = {};
    if (result.data.name) updates.name = result.data.name;
    if (result.data.config) updates.configEncrypted = encryptJson(result.data.config);

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
      return notFound();
    }

    // Fire-and-forget: re-warm the schema cache after credential update
    if (result.data.config) {
      prefetchSchema(connection.type as "neo4j" | "postgresql", result.data.config);
    }

    return NextResponse.json(connection);
  } catch (error) {
    return handleRouteError(error, "Failed to update connection");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const deleted = await db
      .delete(connections)
      .where(and(eq(connections.id, id), eq(connections.userId, userId)))
      .returning({ id: connections.id });

    if (deleted.length === 0) {
      return notFound();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete connection");
  }
}
