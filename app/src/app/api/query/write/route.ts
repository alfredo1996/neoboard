import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { decryptJson } from "@/lib/crypto";
import { executeQuery } from "@/lib/query-executor";
import type { ConnectionCredentials, DbType } from "@/lib/query-executor";

const writeQuerySchema = z.object({
  connectionId: z.string().min(1),
  query: z.string().min(1),
  params: z.record(z.any()).optional(),
});

export async function POST(request: Request) {
  try {
    const { canWrite } = await requireSession();

    if (!canWrite) {
      return NextResponse.json(
        { error: "Write permission required" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = writeQuerySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const { connectionId, query, params } = parsed.data;

    // Only connection owners can execute write queries
    const [connection] = await db
      .select()
      .from(connections)
      .where(eq(connections.id, connectionId))
      .limit(1);

    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 },
      );
    }

    const credentials = decryptJson<ConnectionCredentials>(
      connection.configEncrypted,
    );

    const queryStart = performance.now();
    const result = await executeQuery(
      connection.type as DbType,
      credentials,
      { query, params },
      { accessMode: "WRITE" },
    );
    const serverDurationMs = Math.round(performance.now() - queryStart);

    return NextResponse.json({
      success: true,
      data: result.data,
      serverDurationMs,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Write query execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
