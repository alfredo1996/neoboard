import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections, dashboards, dashboardShares } from "@/lib/db/schema";
import type { UserRole } from "@/lib/db/schema";
import { decryptJson } from "@/lib/crypto/crypto";
import {
  executeQuery,
  toConnectorAccessMode,
} from "@/lib/query/query-executor";
import type { ConnectionCredentials, DbType } from "@/lib/query/query-executor";
import { runPipeline } from "@/lib/query/pipeline";
import type { QueryContext, QueryResult } from "@/lib/query/pipeline-types";
import { layoutsAllowQuery } from "@/lib/query/dashboard-query-binding";

export type ReadQueryOutcome =
  | { ok: true; result: QueryResult }
  | { ok: false; reason: "forbidden" | "not_found"; message: string };

/**
 * Run a user's query read-only: resolve the connection through the access
 * ladder below, then execute through the query pipeline (scheduler, audit
 * log, enterprise rate limiting) in READ mode, with the connection's row
 * limit and timeout enforced by the driver. The query is never modified.
 *
 * Shared by POST /api/query and the MCP `run_query` tool.
 */
export async function runReadQuery(
  session: { userId: string; tenantId: string; role: UserRole },
  input: {
    connectionId: string;
    query: string;
    params?: Record<string, unknown>;
    /** Per-card database override — honoured only when the connection allows it. */
    database?: string;
    /** Scheduler priority, requestId — read by the pipeline middleware. */
    metadata: Record<string, unknown>;
  },
): Promise<ReadQueryOutcome> {
  const { userId, tenantId, role } = session;
  const { connectionId, query, params, database, metadata } = input;

  // 1. Fast path: direct ownership or tenant-shared connection (#901).
  //    Shared connections are first-class queryable for every tenant
  //    user — that's the 'admin provisions, all use' model.
  let [connection] = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.id, connectionId),
        eq(connections.tenantId, tenantId),
        or(
          eq(connections.userId, userId),
          eq(connections.visibility, "shared"),
        ),
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
          eq(connections.tenantId, tenantId),
        ),
      )
      .limit(1);
  }

  // 3. Dashboard-access fallback: user owns or has a share for a dashboard
  //    that references this connectionId in its layout. View-level access
  //    (public dashboards, viewer shares) is BOUND to the queries the
  //    dashboard actually contains (#972) — otherwise sharing a dashboard
  //    would share arbitrary read access to its entire connection.
  //    Edit-level access (dashboard owner, editor share) is unbound:
  //    authoring widgets requires running novel queries.
  if (!connection) {
    const access = await dashboardAccessToConnection(
      userId,
      connectionId,
      tenantId,
    );
    if (access.level !== "none") {
      if (
        access.level === "view" &&
        !layoutsAllowQuery(access.layouts, query)
      ) {
        return {
          ok: false,
          reason: "forbidden",
          message: "Query is not part of any dashboard shared with you",
        };
      }
      [connection] = await db
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.id, connectionId),
            eq(connections.tenantId, tenantId),
          ),
        )
        .limit(1);
    }
  }

  if (!connection) {
    return { ok: false, reason: "not_found", message: "Connection not found" };
  }

  const credentials = decryptJson<ConnectionCredentials>(
    connection.configEncrypted,
  );

  // Apply per-card database override if the connection allows it
  const effectiveCredentials =
    database && connection.allowPerCardDb
      ? { ...credentials, database }
      : credentials;

  const ctx: QueryContext = {
    query,
    params: params ?? {},
    connectionId,
    connectionType: connection.type as DbType,
    userId,
    tenantId,
    accessMode: "read",
    metadata,
  };

  const result = await runPipeline(ctx, async (pipelineCtx) => {
    // Pass the caller's intent through to the connector instead of relying on
    // the connection-config default (#1044). This path is read-only.
    return executeQuery(
      pipelineCtx.connectionType,
      effectiveCredentials,
      { query: pipelineCtx.query, params: pipelineCtx.params },
      { accessMode: toConnectorAccessMode(pipelineCtx.accessMode) },
    );
  });

  return { ok: true, result };
}

/**
 * What claim does this user have on the connection via dashboards that
 * reference it? "edit" (dashboard owner or editor share) grants unbound
 * query access; "view" (public dashboard or viewer share) grants access
 * bound to the referencing dashboards' own queries (#972). Admins never
 * reach this fallback — they match the tenant-wide path above. This grants
 * query execution only — no credential exposure or connection editing.
 */
type DashboardConnectionAccess =
  { level: "none" } | { level: "edit" } | { level: "view"; layouts: unknown[] };

async function dashboardAccessToConnection(
  userId: string,
  connectionId: string,
  tenantId: string,
): Promise<DashboardConnectionAccess> {
  const rows = await db
    .select({
      layoutJson: dashboards.layoutJson,
      ownerId: dashboards.userId,
      shareRole: dashboardShares.role,
    })
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
    );
  if (rows.length === 0) return { level: "none" };
  if (rows.some((r) => r.ownerId === userId || r.shareRole === "editor")) {
    return { level: "edit" };
  }
  return { level: "view", layouts: rows.map((r) => r.layoutJson) };
}
