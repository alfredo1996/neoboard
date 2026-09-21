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
import type { ConnectionCredentials } from "@/lib/query/query-executor";
import { runPipeline } from "@/lib/query/pipeline";
import type { QueryContext } from "@/lib/query/pipeline-types";
import { formParamNames, type FormFieldDef } from "@/lib/widget/form-field-def";
import {
  validateBody,
  forbidden,
  notFound,
  handleRouteError,
} from "@/lib/api/api-utils";
import { apiError, apiSuccess } from "@/lib/api/api-response";
import { getConnector } from "@neoboard/connection";
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

/** The submitted values of a saved form's own fields; any other is dropped. */
function formParams(
  form: DashboardWidget,
  params: Record<string, unknown> = {},
): Record<string, unknown> {
  const fields = form.settings?.formFields;
  const names = formParamNames(
    Array.isArray(fields) ? (fields as FormFieldDef[]) : [],
  );
  return Object.fromEntries(
    Object.entries(params).filter(([name]) => names.has(name)),
  );
}

async function handleWriteQuery(request: Request): Promise<Response> {
  try {
    const { userId, canWrite, tenantId, role } = await requireSession();

    const requestId = request.headers.get("x-request-id") ?? undefined;
    const body = await request.json();
    const validation = validateBody(writeQuerySchema, body);
    if (!validation.success) return validation.response;

    const { connectionId, query, params, widgetId, dashboardId } =
      validation.data;

    // A write that names a widget must name one on a dashboard the caller can
    // open, on this connection (#1832). Viewer level, public dashboards
    // included: a form is submitted from the dashboard as it is shown, which
    // GET /api/dashboards/[id] allows. The widget's database comes from the
    // stored layout, never from the request (#1824).
    let widget: DashboardWidget | undefined;
    if (widgetId && dashboardId) {
      const access = await resolveDashboardAccess({
        dashboardId,
        userId,
        tenantId,
        userRole: role,
        required: "viewer",
      });
      const layout = access?.dashboard.layoutJson as
        DashboardLayoutV2 | null | undefined;
      widget = layout?.pages
        ?.flatMap((p) => p.widgets)
        .find(
          (w: DashboardWidget) =>
            w.id === widgetId && w.connectionId === connectionId,
        );

      // One refusal for a missing or unopenable dashboard, a missing widget or
      // one on another connection, and a form saved with other query text than
      // the request sends: an unsaved form, a stale page, or tampering.
      if (!widget || (widget.chartType === "form" && widget.query !== query)) {
        return notFound("Widget not found");
      }
    }

    // A saved form runs for everyone who can open its dashboard, whatever their
    // write permission, and runs only what it saves (#1831). Any other write
    // needs write permission and the caller's own connection.
    const form = widget?.chartType === "form" ? widget : undefined;
    if (!form && !canWrite) {
      return forbidden("Write permission required");
    }

    // Tenant-scoped. A form's connection is the one it is saved on (matched
    // above), whoever owns it; any other write runs only on the caller's own.
    const [connection] = await db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.id, connectionId),
          eq(connections.tenantId, tenantId),
          form ? undefined : eq(connections.userId, userId),
        ),
      )
      .limit(1);

    if (!connection) {
      return notFound("Connection not found");
    }

    // The editor offers write mode on charts only, so a saved form never
    // carries allowWrites (#1824); any other stored widget needs it.
    if (widget && !form && !widget.allowWrites) {
      return forbidden("Write mode is not enabled for this widget");
    }

    // What the CONNECTOR can do, which is a different question from what the
    // user may do (#1902). Checked for a form submit too: that path is
    // deliberately not gated by `can_write` (#1831), so a check that rode
    // along with the permission gate would let it through. Before the query
    // runs, and before the credentials are decrypted.
    // Fails CLOSED: a connector that has not declared it can write does not
    // get to, and neither does a stored connection whose connector is no
    // longer installed. Both built-ins declare `supportsWrite: true`.
    if (getConnector(connection.type)?.supportsWrite !== true) {
      return apiError(
        "VALIDATION_ERROR",
        "This connection's type does not support write queries",
      );
    }

    const credentials = decryptJson<ConnectionCredentials>(
      connection.configEncrypted,
    );

    // The widget's saved database, when its connection allows a per-card one.
    const effectiveCredentials =
      widget?.database && connection.allowPerCardDb
        ? { ...credentials, database: widget.database }
        : credentials;

    // Write queries always run at P1 — they represent explicit user
    // intent (form submit, manual write) and must not be shed under
    // load like auto-refresh reads can be.
    const metadata: Record<string, unknown> = { priority: 1 };
    if (requestId) metadata.requestId = requestId;

    const ctx: QueryContext = {
      // A form runs its saved query, binding only its own fields' values.
      query: form ? form.query : query,
      params: form ? formParams(form, params) : (params ?? {}),
      connectionId,
      connectionType: connection.type,
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
