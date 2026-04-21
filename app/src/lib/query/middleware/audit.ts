import { queryLogger } from "@/lib/logger";
import type {
  QueryMiddlewareFn,
  QueryResult,
} from "@/lib/query/pipeline-types";

/**
 * Built-in query audit middleware.
 *
 * Emits one structured log entry per query execution with the fields
 * operators need for audit trails: who, what, when, how long, rowcount,
 * status, and a requestId for cross-log correlation.
 *
 * The middleware wraps the core executor, records a start timestamp,
 * calls `next()`, and logs the outcome. On error it re-throws after
 * logging so upstream error handling stays unchanged.
 *
 * This is a core (not enterprise) middleware — it ships with the
 * community edition and is registered at app startup via
 * `bootstrapQueryMiddleware()`.
 */

function countRows(result: QueryResult): number {
  const data = result.data;
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object") {
    // Some connectors return { rows: [...], ... }
    const rows = (data as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows.length;
  }
  return 0;
}

export const auditMiddleware: QueryMiddlewareFn = async (ctx, next) => {
  const startedAt = performance.now();
  const requestId = ctx.metadata.requestId as string | undefined;

  try {
    const result = await next();
    const durationMs = Math.round(performance.now() - startedAt);
    const schedulerWaitMs = ctx.metadata.schedulerWaitMs;
    queryLogger.info(
      {
        event: "query_executed",
        status: "success",
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        connectionId: ctx.connectionId,
        connectionType: ctx.connectionType,
        accessMode: ctx.accessMode,
        query: ctx.query,
        durationMs,
        rowCount: countRows(result),
        truncated: result.truncated === true || undefined,
        rowLimit: result.rowLimit,
        requestId,
        // Only included when the scheduler middleware ran (slice 2 of #129).
        schedulerWaitMs:
          typeof schedulerWaitMs === "number" ? schedulerWaitMs : undefined,
      },
      "query_executed",
    );
    return result;
  } catch (err) {
    const durationMs = Math.round(performance.now() - startedAt);
    queryLogger.warn(
      {
        event: "query_failed",
        status: "error",
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        connectionId: ctx.connectionId,
        connectionType: ctx.connectionType,
        accessMode: ctx.accessMode,
        query: ctx.query,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
        requestId,
      },
      "query_failed",
    );
    throw err;
  }
};
