import { z } from "zod";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  connections,
  dashboards,
  dashboardShares,
  users,
} from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { decryptJson } from "@/lib/crypto/crypto";
import {
  executeQuery,
  toConnectorAccessMode,
} from "@/lib/query/query-executor";
import type { ConnectionCredentials } from "@/lib/query/query-executor";
import { computeResultId } from "@/lib/query/query-hash";
import { runPipeline } from "@/lib/query/pipeline";
import type { QueryContext } from "@/lib/query/pipeline-types";
import {
  validateBody,
  forbidden,
  notFound,
  handleRouteError,
  readJsonBody,
} from "@/lib/api/api-utils";
import { apiSuccess } from "@/lib/api/api-response";
import { layoutsAllowQuery } from "@/lib/query/dashboard-query-binding";
import { usableConnection } from "@/lib/db/connection-access";
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
  params: z.record(z.string(), z.unknown()).optional(),
  /** Optional defense-in-depth field: when provided, must match the session tenant. */
  tenantId: z.string().optional(),
  /** Per-card database override — used when the connection allows per-card DB selection. */
  database: z.string().optional(),
  /**
   * Fewer rows than the connection allows, for this run only (#1896; the
   * editor preview asks for 25). `executeQuery` clamps it to the connection's
   * `maxRows`, so it can lower the cap and never raise it.
   */
  rowLimit: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  return logRoute(request, "query", () => handleReadQuery(request));
}

async function handleReadQuery(request: Request): Promise<Response> {
  try {
    const {
      userId,
      tenantId: sessionTenantId,
      role,
      canWrite,
    } = await requireSession();
    const requestId = request.headers.get("x-request-id") ?? undefined;
    const priority = readPriorityHeader(
      request.headers.get("x-query-priority"),
    );
    const body = await readJsonBody(request);
    const validation = validateBody(querySchema, body);
    if (!validation.success) return validation.response;

    const {
      connectionId,
      query,
      params,
      tenantId: bodyTenantId,
      database: databaseOverride,
      rowLimit: requestedRowLimit,
    } = validation.data;

    // Defense-in-depth: if the caller explicitly passes a tenantId,
    // assert it matches the session to catch misconfigured clients early.
    if (bodyTenantId && bodyTenantId !== sessionTenantId) {
      return forbidden("Tenant mismatch");
    }

    // 1. Direct access: the caller owns the connection, it is shared with the
    //    tenant (#901, the 'admin provisions, all use' model), or the caller
    //    is an admin. The rule every dashboard write checks (#1816).
    let [connection] = await db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.id, connectionId),
          eq(connections.tenantId, sessionTenantId),
          usableConnection(userId, role),
        ),
      )
      .limit(1);

    // 2. Dashboard-access fallback: user owns or has a share for a dashboard
    //    that references this connectionId in its layout. View-level access
    //    (public dashboards, viewer shares) is BOUND to the queries the
    //    dashboard actually contains (#972), each on its widget's connection
    //    and saved database (#1822) — otherwise sharing a dashboard would
    //    share arbitrary read access to its entire connection.
    //    Edit-level access (dashboard owner, editor share) is unbound:
    //    authoring widgets requires running novel queries. It holds only while
    //    the caller may write and the dashboard's owner can use the connection
    //    (#1816).
    if (!connection) {
      const access = await dashboardAccessToConnection(
        userId,
        connectionId,
        sessionTenantId,
        canWrite,
      );
      if (access.level !== "none") {
        if (
          access.level === "view" &&
          !layoutsAllowQuery(access.layouts, {
            connectionId,
            query,
            database: databaseOverride,
          })
        ) {
          return forbidden(
            "Query is not part of any dashboard shared with you",
          );
        }
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

    // Apply per-card database override if the connection allows it. A
    // view-level request gets here only with the database its widget saves.
    const effectiveCredentials =
      databaseOverride && connection.allowPerCardDb
        ? { ...credentials, database: databaseOverride }
        : credentials;

    const metadata: Record<string, unknown> = { priority };
    if (requestId) metadata.requestId = requestId;

    const ctx: QueryContext = {
      query,
      params: params ?? {},
      connectionId,
      connectionType: connection.type,
      userId,
      tenantId: sessionTenantId,
      accessMode: "read",
      metadata,
    };

    const queryStart = performance.now();
    const result = await runPipeline(ctx, async (pipelineCtx) => {
      // Pass the route's intent through to the connector instead of relying on
      // the connection-config default (#1044). This route is read-only.
      return executeQuery(
        pipelineCtx.connectionType,
        effectiveCredentials,
        { query: pipelineCtx.query, params: pipelineCtx.params },
        {
          accessMode: toConnectorAccessMode(pipelineCtx.accessMode),
          rowLimit: requestedRowLimit,
        },
      );
    });
    const serverDurationMs = Math.round(performance.now() - queryStart);

    // Truncation is enforced at the driver level (see
    // lib/query/query-executor.ts — it spreads `rowLimit` onto the connector
    // config and each connector slices at that value before calling
    // onSuccess). The executor captures the `COMPLETE_TRUNCATED` signal via
    // its setStatus handler and returns { truncated, rowLimit } alongside
    // the data, so the route just forwards those fields to the client for
    // the widget banner.
    const { data, truncated, rowLimit } = result;

    // Deterministic query hash: same connection + database + trimmed query
    // + params + effective row limit → same resultId. Clients use it to keep
    // state (e.g. graph exploration) across re-runs of the same query; it is
    // not a cache key (see computeResultId). The row limit is in it because the
    // editor preview runs the card's exact query text at 25 rows (#1896), the
    // database because a card can switch databases on one connection (#1964).
    const database = effectiveCredentials.database;
    const resultId = computeResultId(
      connectionId,
      query,
      params,
      rowLimit,
      typeof database === "string" ? database : undefined,
    );

    return apiSuccess({ data }, 200, {
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
type DashboardConnectionAccess =
  { level: "none" } | { level: "edit" } | { level: "view"; layouts: unknown[] };

/**
 * What claim does this user have on the connection via dashboards that
 * reference it? "edit" grants unbound query access; "view" grants access bound
 * to the referencing dashboards' own queries (#972). Admins never reach this
 * fallback — they match the tenant-wide path above.
 *
 * "edit" comes from a dashboard the caller owns or holds an editor share on,
 * and only while the caller may write and the dashboard's owner can use the
 * connection directly today: owns it, or is an admin (a shared connection took
 * the fast path above). Anything else is "view". So a connection made private
 * again, an owner who lost the admin role, or an admin's write onto someone
 * else's dashboard grants no new queries (#1816). The save route keeps a bound
 * writer from adding queries to such a layout, since the binding reads it.
 */
async function dashboardAccessToConnection(
  userId: string,
  connectionId: string,
  tenantId: string,
  canWrite: boolean,
): Promise<DashboardConnectionAccess> {
  const rows = await db
    .select({
      layoutJson: dashboards.layoutJson,
      ownerId: dashboards.userId,
      shareRole: dashboardShares.role,
      connectionOwnerId: connections.userId,
      ownerRole: users.role,
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
    .leftJoin(
      connections,
      and(eq(connections.id, connectionId), eq(connections.tenantId, tenantId)),
    )
    .leftJoin(
      users,
      and(eq(users.id, dashboards.userId), eq(users.tenantId, tenantId)),
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
  const authors = rows.some(
    (r) =>
      (r.ownerId === userId || r.shareRole === "editor") &&
      (r.connectionOwnerId === r.ownerId || r.ownerRole === "admin"),
  );
  if (canWrite && authors) return { level: "edit" };
  return { level: "view", layouts: rows.map((r) => r.layoutJson) };
}
