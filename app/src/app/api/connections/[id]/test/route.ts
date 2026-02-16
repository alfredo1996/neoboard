import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireUserId } from "@/lib/auth/session";
import { decryptJson } from "@/lib/crypto";
import { testConnection } from "@/lib/query-executor";
import type { ConnectionCredentials, DbType } from "@/lib/query-executor";

export async function POST(
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

    const success = await testConnection(
      connection.type as DbType,
      credentials
    );

    return NextResponse.json({ success });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Connection test failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
