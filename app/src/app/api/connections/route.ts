import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireUserId } from "@/lib/auth/session";
import { encryptJson } from "@/lib/crypto";
import { prefetchSchema } from "@/lib/schema-prefetch";
import { createConnectionSchema } from "@/lib/schemas";
import { validateBody, unauthorized, handleRouteError } from "@/lib/api-utils";

export async function GET() {
  try {
    const userId = await requireUserId();

    const result = await db
      .select({
        id: connections.id,
        name: connections.name,
        type: connections.type,
        createdAt: connections.createdAt,
        updatedAt: connections.updatedAt,
      })
      .from(connections)
      .where(eq(connections.userId, userId));

    return NextResponse.json(result);
  } catch {
    return unauthorized();
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const result = validateBody(createConnectionSchema, body);
    if (!result.success) return result.response;

    const { name, type, config } = result.data;
    const configEncrypted = encryptJson(config);

    const [connection] = await db
      .insert(connections)
      .values({
        userId,
        name,
        type,
        configEncrypted,
      })
      .returning({
        id: connections.id,
        name: connections.name,
        type: connections.type,
        createdAt: connections.createdAt,
      });

    // Fire-and-forget: pre-warm the schema cache for the new connection
    prefetchSchema(type, result.data.config);

    return NextResponse.json(connection, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Failed to create connection");
  }
}
