import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { decryptJson } from "@/lib/crypto";
import { executeQuery } from "@/lib/query-executor";
import type { ConnectionCredentials, DbType } from "@/lib/query-executor";
import { computeResultId } from "@/lib/query-hash";

/** Maximum number of rows returned per query execution to prevent OOM. */
const MAX_ROWS = 10_000;

const querySchema = z.object({
  connectionId: z.string().min(1),
  query: z.string().min(1),
  params: z.record(z.any()).optional(),
  /** Optional defense-in-depth field: when provided, must match the session tenant. */
  tenantId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const { userId, tenantId: sessionTenantId } = await requireSession();
    const body = await request.json();
    const parsed = querySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { connectionId, query, params, tenantId: bodyTenantId } = parsed.data;

    // Defense-in-depth: if the caller explicitly passes a tenantId,
    // assert it matches the session to catch misconfigured clients early.
    if (bodyTenantId && bodyTenantId !== sessionTenantId) {
      return NextResponse.json({ error: "Tenant mismatch" }, { status: 403 });
    }

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
    // cache key. Normalization handled inside computeResultId.
    const resultId = computeResultId(connectionId, query, params);

    // TODO: MAX_ROWS truncation currently happens after full materialisation.
    // Ideally, pass a maxRows option to executeQuery so the driver can stop
    // reading at MAX_ROWS+1 (cursor/stream consumption) to avoid OOM on very
    // large result sets. See CodeRabbit review on PR #75.
    const rawData = result.data;
    const truncated = Array.isArray(rawData) && rawData.length > MAX_ROWS;
    const truncatedData = truncated ? (rawData as unknown[]).slice(0, MAX_ROWS) : rawData;

    return NextResponse.json({ ...result, data: truncatedData, resultId, ...(truncated ? { truncated: true } : {}) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Query execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
