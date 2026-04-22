import { z } from "zod";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections, dashboards, dashboardShares } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { decryptJson } from "@/lib/crypto/crypto";
import { executeQuery } from "@/lib/query/query-executor";
import type { ConnectionCredentials, DbType } from "@/lib/query/query-executor";
import { computeResultId } from "@/lib/query/query-hash";
import { runPipeline } from "@/lib/query/pipeline";
import type { QueryContext } from "@/lib/query/pipeline-types";
import {
  validateBody,
  forbidden,
  notFound,
  handleRouteError,
} from "@/lib/api/api-utils";
import { apiSuccess } from "@/lib/api/api-response";
import { logRoute } from "@/lib/api/log-route";
import type { QueryPriority } from "@/lib/query/scheduler";

/**
 * Parse the `x-query-priority` header into a valid priority tier.
 * Invalid or missing values default to P2 (load) so the request
 * behaves like a dashboard page load under the scheduler.
 */
function readPriorityHeader(raw: string | null): QueryPriority {
  if (raw === "1" || raw === "2" || raw === "3") {
    return Number.parseInt(raw, 10) as QueryPriority;
  }
  return 2;
}

const querySchema = z.object({
  connectionId: z.string().min(1),
  query: z.string().min(1),
  params: z.record(z.unknown()).optional(),
  /** Optional defense-in-depth field: when provided, must match the session tenant. */
  tenantId: z.string().optional(),
});

export async function POST(request: Request) {
  return logRoute(request, "query", () => handleReadQuery(request));
}

async function handleReadQuery(request: Request): Promise<Response> {
  try {
    const { userId, tenantId: sessionTenantId, role } = await requireSession();
    const requestId = request.headers.get("x-request-id") ?? undefined;
    const priority = readPriorityHeader(
      request.headers.get("x-query-priority"),
    );
    const body = await request.json();
    const validation = validateBody(querySchema, body);
    if (!validation.success) return validation.response;

    const {
      connectionId,
      query,
      params,
      tenantId: bodyTenantId,
    } = validation.data;

    // Defense-in-depth: if the caller explicitly passes a tenantId,
    // assert it matches the session to catch misconfigured clients early.
    if (bodyTenantId && bodyTenantId !== sessionTenantId) {
      return forbidden("Tenant mismatch");
    }

    // 1. Fast path: direct ownership (tenant-scoped)
    let [connection] = await db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.id, connectionId),
          eq(connections.userId, userId),
          eq(connections.tenantId, sessionTenantId),
        ),
      )
      .limit(1);

    // 2. Admin fallback: admin can use any connection in the same tenant.
    if (!connection && role === "admin") {
      [connection] = await db
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.id, connectionId),
            eq(connections.tenantId, sessionTenantId),
          ),
        )
        .limit(1);
    }

    // 3. Dashboard-access fallback: user owns or has a share for a dashboard
    //    that references this connectionId in its layout
    if (!connection) {
      const hasAccess = await userHasDashboardAccessToConnection(
        userId,
        connectionId,
        sessionTenantId,
      );
      if (hasAccess) {
        [connection] = await db
          .select()
          .from(connections)
          .where(
            and(
              eq(connections.id, connectionId),
              eq(connections.tenantId, sessionTenantId),
            ),
          )
          .limit(1);
      }
    }

    if (!connection) {
      return notFound("Connection not found");
    }

    const credentials = decryptJson<ConnectionCredentials>(
      connection.configEncrypted,
    );

    const metadata: Record<string, unknown> = { priority };
    if (requestId) metadata.requestId = requestId;

    const ctx: QueryContext = {
      query,
      params: params ?? {},
      connectionId,
      connectionType: connection.type as DbType,
      userId,
      tenantId: sessionTenantId,
      accessMode: "read",
      metadata,
    };

    const queryStart = performance.now();
    const result = await runPipeline(ctx, async (pipelineCtx) =>
      executeQuery(pipelineCtx.connectionType, credentials, {
        query: pipelineCtx.query,
        params: pipelineCtx.params,
      }),
    );
    const serverDurationMs = Math.round(performance.now() - queryStart);

    // Deterministic query hash: same connection + normalized query + params
    // → same resultId. Clients can use this to preserve state (e.g. graph
    // exploration) across re-executions of the same query, and as a future
    // cache key. Normalization handled inside computeResultId.
    const resultId = computeResultId(connectionId, query, params);

    // Truncation is enforced at the driver level (see
    // lib/query/query-executor.ts — it spreads `rowLimit` onto the connector
    // config and each connector slices at that value before calling
    // onSuccess). The executor captures the `COMPLETE_TRUNCATED` signal via
    // its setStatus handler and returns { truncated, rowLimit } alongside
    // the data, so the route just forwards those fields to the client for
    // the widget banner.
    const { data, fields, truncated, rowLimit } = result;

    return apiSuccess({ data, fields }, 200, {
      resultId,
      serverDurationMs,
      rowLimit,
      ...(truncated ? { truncated: true } : {}),
    });
  } catch (error) {
    return handleRouteError(error, "Query execution failed");
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
  tenantId: string,
): Promise<boolean> {
  const [result] = await db
    .select({ id: dashboards.id })
    .from(dashboards)
    .leftJoin(
      dashboardShares,
      and(
        eq(dashboardShares.dashboardId, dashboards.id),
        eq(dashboardShares.userId, userId),
        eq(dashboardShares.tenantId, tenantId),
      ),
    )
    .where(
      and(
        eq(dashboards.tenantId, tenantId),
        or(
          eq(dashboards.userId, userId),
          sql`${dashboardShares.id} IS NOT NULL`,
          eq(dashboards.isPublic, true),
        ),
        sql`EXISTS (
          SELECT 1 FROM jsonb_array_elements(${dashboards.layoutJson}->'pages') AS page,
          jsonb_array_elements(page->'widgets') AS widget
          WHERE widget->>'connectionId' = ${connectionId}
        )`,
      ),
    )
    .limit(1);
  return !!result;
}
