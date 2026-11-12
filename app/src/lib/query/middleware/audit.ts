import { queryLogger } from "@/lib/logger";
import type {
  QueryContext,
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

function waitOf(ctx: QueryContext): number | undefined {
  const wait = ctx.metadata.schedulerWaitMs;
  return typeof wait === "number" ? wait : undefined;
}

/** Queue wait plus connector execution; durationMs stays execution only (#2438). */
function totalOf(wait: number | undefined, durationMs: number): number {
  return (wait ?? 0) + durationMs;
}

export const auditMiddleware: QueryMiddlewareFn = async (ctx, next) => {
  const startedAt = performance.now();
  const requestId = ctx.metadata.requestId as string | undefined;

  try {
    const result = await next();
    const durationMs = Math.round(performance.now() - startedAt);
    const schedulerWaitMs = waitOf(ctx);
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
        schedulerWaitMs,
        totalMs: totalOf(schedulerWaitMs, durationMs),
      },
      "query_executed",
    );
    return result;
  } catch (err) {
    const durationMs = Math.round(performance.now() - startedAt);
    const schedulerWaitMs = waitOf(ctx);
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
        schedulerWaitMs,
        totalMs: totalOf(schedulerWaitMs, durationMs),
        requestId,
        // Use pino's `err` key so stdSerializers picks it up and
        // serializes message + stack + code properly for Fluentd/ELK.
        err: err instanceof Error ? err : String(err),
        // Machine-readable error type for filtering/alerting
        errorCode: errorCodeOf(err, ctx.signal?.aborted === true),
      },
      "query_failed",
    );
    throw err;
  }
};

function errorCodeOf(err: unknown, aborted: boolean): string {
  if (aborted) return "aborted";
  if (!(err instanceof Error)) return "UNKNOWN";
  return (err as Error & { code?: string }).code ?? err.name;
}
