import { queryLogger } from "@/lib/logger";
import {
  isQueryAborted,
  isQueueRejected,
  isQueueTimeout,
  type QueryPriority,
} from "@/lib/query/scheduler";
import {
  noteConnection,
  recordQuery,
  recordQueueTimeout,
  recordRejection,
} from "@/lib/metrics";
import { getScheduler } from "@/lib/query/scheduler-registry";
import type {
  QueryMiddlewareFn,
  QueryResult,
} from "@/lib/query/pipeline-types";

/**
 * Built-in query middleware that routes every query through the
 * per-connector priority scheduler. Registered alongside the audit
 * middleware in bootstrap.ts.
 *
 * Priority is read from `ctx.metadata.priority`. Route handlers set it
 * from the `x-query-priority` header (or force P1 for write queries).
 * If the metadata is missing or invalid the middleware falls back to
 * P2 (load) — safe default.
 *
 * On enqueue the middleware stashes the wait duration on
 * `ctx.metadata.schedulerWaitMs` so the audit middleware (slice 1 of
 * #128) can log it.
 *
 * `QueueRejectedError` and `QueueTimeoutError` from the scheduler are
 * re-thrown unchanged. The route handler maps them to 503 and 408
 * HTTP responses via handleRouteError.
 */

function resolvePriority(raw: unknown): QueryPriority {
  if (raw === 1 || raw === 2 || raw === 3) return raw;
  if (typeof raw === "string") {
    const n = Number.parseInt(raw, 10);
    if (n === 1 || n === 2 || n === 3) return n;
  }
  return 2;
}

/**
 * Run `work` inside a slot of the connection's scheduler: wait for one, run,
 * release it whatever happens. `work` is told how long it waited.
 *
 * The middleware below is this plus a query context. It is exported for the
 * work on a connector that is not a query and so has no pipeline to go
 * through — the connection probe (#1426) — so that it draws on the same
 * per-connection budget as the queries do.
 */
export async function withSchedulerSlot<T>(
  who: {
    connectionId: string;
    userId: string;
    priority: QueryPriority;
    /** Withdraws the ticket while it waits; a running one keeps its slot. */
    signal?: AbortSignal;
  },
  work: (waitMs: number) => Promise<T>,
): Promise<T> {
  const scheduler = getScheduler(who.connectionId);
  const ticket = {
    // Global Web Crypto available in Node 20+ and edge runtimes.
    // Avoids a `node:crypto` import that webpack refuses to bundle.
    id: crypto.randomUUID(),
    userId: who.userId,
    connectorId: who.connectionId,
    priority: who.priority,
    enqueuedAt: Date.now(),
  };

  await scheduler.enqueue(ticket, who.signal);
  try {
    return await work(Date.now() - ticket.enqueuedAt);
  } finally {
    scheduler.release(ticket.id);
  }
}

function observeQuery(
  connectorType: string,
  priority: QueryPriority,
  outcome: "success" | "error",
  ran: { waitMs: number; startedAt: number },
): void {
  recordQuery({
    connectorType,
    priority,
    outcome,
    waitMs: ran.waitMs,
    execMs: performance.now() - ran.startedAt,
  });
}

export const schedulerMiddleware: QueryMiddlewareFn = async (
  ctx,
  next,
): Promise<QueryResult> => {
  const enqueuedAt = Date.now();
  const priority = resolvePriority(ctx.metadata.priority);
  noteConnection(ctx.connectionId, ctx.connectionType);
  let ran: { waitMs: number; startedAt: number } | undefined;
  try {
    return await withSchedulerSlot(
      {
        connectionId: ctx.connectionId,
        userId: ctx.userId,
        priority,
        signal: ctx.signal,
      },
      async (waitMs) => {
        ctx.metadata.schedulerWaitMs = waitMs;
        ran = { waitMs, startedAt: performance.now() };
        const result = await next();
        observeQuery(ctx.connectionType, priority, "success", ran);
        return result;
      },
    );
  } catch (err) {
    if (ran) observeQuery(ctx.connectionType, priority, "error", ran);
    else if (isQueueTimeout(err)) recordQueueTimeout(ctx.connectionType);
    else if (isQueueRejected(err))
      recordRejection(ctx.connectionType, err.reason);

    // A refusal never reaches the audit middleware (it sits inside this one),
    // so it writes its own query_failed line (#2438).
    if (isQueueTimeout(err) || isQueueRejected(err) || isQueryAborted(err)) {
      const waited = Date.now() - enqueuedAt;
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
          priority,
          schedulerWaitMs: waited,
          totalMs: waited,
          requestId: ctx.metadata.requestId,
          err,
          errorCode: isQueryAborted(err) ? "aborted" : (err as Error).name,
        },
        "query_failed",
      );
    }
    throw err;
  }
};
