import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections } from "@/lib/db/schema";
import type { DashboardLayoutV2, DashboardWidget } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { resolveDashboardAccess } from "@/lib/dashboard/access";
import { decryptJson } from "@/lib/crypto/crypto";
import {
  executeQuery,
  toConnectorAccessMode,
} from "@/lib/query/query-executor";
import type { ConnectionCredentials, DbType } from "@/lib/query/query-executor";
import { runPipeline } from "@/lib/query/pipeline";
import type { QueryContext } from "@/lib/query/pipeline-types";
import {
  validateBody,
  forbidden,
  notFound,
  handleRouteError,
} from "@/lib/api/api-utils";
import { apiError, apiSuccess } from "@/lib/api/api-response";
import { describeWriteError } from "@/lib/api/db-error-message";
import { logRoute } from "@/lib/api/log-route";
import { apiLogger } from "@/lib/logger";

const writeQuerySchema = z.object({
  connectionId: z.string().min(1),
  query: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
  /** Widget ID — the stored widget is checked, and its saved database used. */
  widgetId: z.string().min(1).optional(),
  /** Dashboard ID — required alongside widgetId for lookup. */
  dashboardId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  return logRoute(request, "query-write", () => handleWriteQuery(request));
}

async function handleWriteQuery(request: Request): Promise<Response> {
  try {
    const { userId, canWrite, tenantId, role } = await requireSession();

    if (!canWrite) {
      return forbidden("Write permission required");
    }

    const requestId = request.headers.get("x-request-id") ?? undefined;
    const body = await request.json();
    const validation = validateBody(writeQuerySchema, body);
    if (!validation.success) return validation.response;

    const { connectionId, query, params, widgetId, dashboardId } =
      validation.data;

    // Only connection owners can execute write queries (tenant-scoped)
    const [connection] = await db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.id, connectionId),
          eq(connections.userId, userId),
          eq(connections.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!connection) {
      return notFound("Connection not found");
    }

    // Per-widget write enforcement: when widgetId + dashboardId are provided,
    // the widget must be on this connection, on a dashboard the caller can
    // open, and may write; its database comes from the stored layout, never
    // from the request (#1824). Form widgets send both. Without them the write
    // runs on the connection's default database. User-level canWrite and
    // connection ownership are enforced above either way.
    let widgetDatabaseOverride: string | undefined;
    if (widgetId && dashboardId) {
      // Viewer level, public dashboards included: a form is submitted from the
      // dashboard as it is shown, which GET /api/dashboards/[id] allows.
      const access = await resolveDashboardAccess({
        dashboardId,
        userId,
        tenantId,
        userRole: role,
        required: "viewer",
      });
      const layout = access?.dashboard.layoutJson as
        | DashboardLayoutV2
        | null
        | undefined;
      const widget = layout?.pages
        ?.flatMap((p) => p.widgets)
        .find(
          (w: DashboardWidget) =>
            w.id === widgetId && w.connectionId === connectionId,
        );

      // One refusal for a missing or unopenable dashboard and for a missing
      // widget or one on another connection.
      if (!widget) {
        return notFound("Widget not found");
      }

      // A form exists to write, and the editor offers no write-mode flag for
      // one, so a saved form never carries allowWrites (#1824).
      if (widget.chartType !== "form" && !widget.allowWrites) {
        return forbidden("Write mode is not enabled for this widget");
      }

      // Only apply per-card DB override when the connection allows it
      if (widget.database && connection.allowPerCardDb) {
        widgetDatabaseOverride = widget.database;
      }
    }

    const credentials = decryptJson<ConnectionCredentials>(
      connection.configEncrypted,
    );

    // Use per-card database override if set and allowed
    const effectiveCredentials = widgetDatabaseOverride
      ? { ...credentials, database: widgetDatabaseOverride }
      : credentials;

    // Write queries always run at P1 — they represent explicit user
    // intent (form submit, manual write) and must not be shed under
    // load like auto-refresh reads can be.
    const metadata: Record<string, unknown> = { priority: 1 };
    if (requestId) metadata.requestId = requestId;

    const ctx: QueryContext = {
      query,
      params: params ?? {},
      connectionId,
      connectionType: connection.type as DbType,
      userId,
      tenantId,
      accessMode: "write",
      metadata,
    };

    const queryStart = performance.now();
    const result = await runPipeline(ctx, async (pipelineCtx) =>
      executeQuery(
        pipelineCtx.connectionType,
        effectiveCredentials,
        { query: pipelineCtx.query, params: pipelineCtx.params },
        // Derive from the context (this route is write) so the access mode has
        // a single source of truth rather than a hardcoded duplicate (#1044).
        { accessMode: toConnectorAccessMode(pipelineCtx.accessMode) },
      ),
    );
    const serverDurationMs = Math.round(performance.now() - queryStart);

    return apiSuccess(result.data, 200, { serverDurationMs });
  } catch (error) {
    apiLogger.error(
      {
        event: "write_query_failed",
        err: error instanceof Error ? error.message : String(error),
      },
      "write_query_failed",
    );
    // safeMessage: write queries echo user SQL in driver errors — never leak.
    // But surface a specific, sanitized reason (constraint/column) when we can
    // recognise the driver error, so form users see "The field X is required"
    // instead of a bare "execution failed" (#1162).
    // Recognised errors are the user's to fix, so they answer 4xx, with the
    // blank column attached for the form to put on its field (#1409).
    const described = describeWriteError(error);
    if (described) {
      return apiError(
        described.code,
        described.message,
        described.column ? { column: described.column } : undefined,
      );
    }
    return handleRouteError(error, "Write query execution failed", {
      safeMessage: true,
    });
  }
}
