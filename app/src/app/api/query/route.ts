import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections, dashboards, dashboardShares } from "@/lib/db/schema";
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
    const { userId, tenantId: sessionTenantId, role } = await requireSession();
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

    // 1. Fast path: direct ownership
    let [connection] = await db
      .select()
      .from(connections)
      .where(
        and(eq(connections.id, connectionId), eq(connections.userId, userId))
      )
      .limit(1);

    // 2. Admin fallback: admin can use any connection in the tenant
    if (!connection && role === "admin") {
      [connection] = await db
        .select()
        .from(connections)
        .where(eq(connections.id, connectionId))
        .limit(1);
    }

    // 3. Dashboard-access fallback: user owns or has a share for a dashboard
    //    that references this connectionId in its layout
    if (!connection) {
      const hasAccess = await userHasDashboardAccessToConnection(
        userId,
        connectionId,
        sessionTenantId
      );
      if (hasAccess) {
        [connection] = await db
          .select()
          .from(connections)
          .where(eq(connections.id, connectionId))
          .limit(1);
      }
    }

    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    const credentials = decryptJson<ConnectionCredentials>(
      connection.configEncrypted
    );

    const queryStart = performance.now();
    const result = await executeQuery(
      connection.type as DbType,
      credentials,
      { query, params },
    );
    const serverDurationMs = Math.round(performance.now() - queryStart);

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

    return NextResponse.json({ ...result, data: truncatedData, resultId, serverDurationMs, ...(truncated ? { truncated: true } : {}) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Query execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Check if the user owns or has been shared a dashboard whose layout
 * references the given connectionId. This grants query-execution access
 * only — no credential exposure or connection editing.
 */
async function userHasDashboardAccessToConnection(
  userId: string,
  connectionId: string,
  tenantId: string
): Promise<boolean> {
  const [result] = await db
    .select({ id: dashboards.id })
    .from(dashboards)
    .leftJoin(
      dashboardShares,
      and(
        eq(dashboardShares.dashboardId, dashboards.id),
        eq(dashboardShares.userId, userId),
        eq(dashboardShares.tenantId, tenantId)
      )
    )
    .where(
      and(
        eq(dashboards.tenantId, tenantId),
        or(
          eq(dashboards.userId, userId),
          sql`${dashboardShares.id} IS NOT NULL`,
          eq(dashboards.isPublic, true)
        ),
        sql`EXISTS (
          SELECT 1 FROM jsonb_array_elements(${dashboards.layoutJson}->'pages') AS page,
          jsonb_array_elements(page->'widgets') AS widget
          WHERE widget->>'connectionId' = ${connectionId}
        )`
      )
    )
    .limit(1);
  return !!result;
}
