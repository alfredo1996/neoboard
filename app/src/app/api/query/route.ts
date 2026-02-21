import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireUserId } from "@/lib/auth/session";
import { decryptJson } from "@/lib/crypto";
import { executeQuery } from "@/lib/query-executor";
import type { ConnectionCredentials, DbType } from "@/lib/query-executor";

const querySchema = z.object({
  connectionId: z.string().min(1),
  query: z.string().min(1),
  params: z.record(z.any()).optional(),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const parsed = querySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { connectionId, query, params } = parsed.data;

    // Verify user owns the connection
    const [connection] = await db
      .select()
      .from(connections)
      .where(
        and(eq(connections.id, connectionId), eq(connections.userId, userId))
      )
      .limit(1);

    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    const credentials = decryptJson<ConnectionCredentials>(
      connection.configEncrypted
    );

    const result = await executeQuery(
      connection.type as DbType,
      credentials,
      { query, params },
    );

    // Deterministic query hash: same connection + normalized query + params
    // → same resultId. Clients can use this to preserve state (e.g. graph
    // exploration) across re-executions of the same query, and as a future
    // cache key. Normalization: trim + collapse whitespace + lowercase so
    // minor formatting differences don't invalidate the hash.
    const normalizedQuery = query.trim().replace(/\s+/g, " ").toLowerCase();
    const resultId = createHash("sha256")
      .update(connectionId)
      .update("\x00")
      .update(normalizedQuery)
      .update("\x00")
      .update(JSON.stringify(params ?? null))
      .digest("hex")
      .slice(0, 16);

    return NextResponse.json({ ...result, resultId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Query execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
