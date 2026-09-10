import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { computeResultId } from "@/lib/query/query-hash";
import { runReadQuery } from "@/lib/query/run-read-query";
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
  params: z.record(z.string(), z.unknown()).optional(),
  /** Optional defense-in-depth field: when provided, must match the session tenant. */
  tenantId: z.string().optional(),
  /** Per-card database override — used when the connection allows per-card DB selection. */
  database: z.string().optional(),
});

export async function POST(request: Request) {
  return logRoute(request, "query", () => handleReadQuery(request));
}

async function handleReadQuery(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
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
      database,
    } = validation.data;

    // Defense-in-depth: if the caller explicitly passes a tenantId,
    // assert it matches the session to catch misconfigured clients early.
    if (bodyTenantId && bodyTenantId !== session.tenantId) {
      return forbidden("Tenant mismatch");
    }

    const metadata: Record<string, unknown> = { priority };
    if (requestId) metadata.requestId = requestId;

    // Access ladder (#901, #972), READ mode (#1044) and the pipeline live in
    // runReadQuery, shared with the MCP run_query tool.
    const queryStart = performance.now();
    const outcome = await runReadQuery(session, {
      connectionId,
      query,
      params,
      database,
      metadata,
    });
    if (!outcome.ok) {
      return outcome.reason === "forbidden"
        ? forbidden(outcome.message)
        : notFound(outcome.message);
    }
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
    const { data, fields, truncated, rowLimit } = outcome.result;

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
