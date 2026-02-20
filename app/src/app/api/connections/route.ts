import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireUserId } from "@/lib/auth/session";
import { encryptJson } from "@/lib/crypto";
import { prefetchSchema } from "@/lib/schema-prefetch";

const createConnectionSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["neo4j", "postgresql"]),
  config: z.object({
    uri: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    database: z.string().optional(),
  }),
});

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const parsed = createConnectionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, type, config } = parsed.data;
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
    prefetchSchema(type, parsed.data.config);

    return NextResponse.json(connection, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create connection";
    if (message.includes("Unauthorized") || message.includes("session")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
