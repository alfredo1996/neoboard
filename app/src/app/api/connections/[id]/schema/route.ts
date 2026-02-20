import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireUserId } from "@/lib/auth/session";
import { decryptJson } from "@/lib/crypto";
import { fetchConnectionSchema } from "@/lib/schema-prefetch";
import type { ConnectionCredentials } from "@/lib/query-executor";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const [connection] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.id, id), eq(connections.userId, userId)))
      .limit(1);

    if (!connection) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const credentials = decryptJson<ConnectionCredentials>(
      connection.configEncrypted
    );

    const schema = await fetchConnectionSchema(
      connection.type as "neo4j" | "postgresql",
      credentials
    );

    return NextResponse.json(schema);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch schema";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
