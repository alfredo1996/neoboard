import { getScheduler } from "@/lib/query/scheduler-registry";
import type {
  QueryMiddlewareFn,
  QueryResult,
} from "@/lib/query/pipeline-types";
import type { QueryPriority } from "@/lib/query/scheduler";

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

export const schedulerMiddleware: QueryMiddlewareFn = async (
  ctx,
  next,
): Promise<QueryResult> => {
  const scheduler = getScheduler(ctx.connectionId);
  const priority = resolvePriority(ctx.metadata.priority);
  const ticket = {
    // Global Web Crypto available in Node 20+ and edge runtimes.
    // Avoids a `node:crypto` import that webpack refuses to bundle.
    id: crypto.randomUUID(),
    userId: ctx.userId,
    connectorId: ctx.connectionId,
    priority,
    enqueuedAt: Date.now(),
  };

  await scheduler.enqueue(ticket);
  ctx.metadata.schedulerWaitMs = Date.now() - ticket.enqueuedAt;

  try {
    return await next();
  } finally {
    scheduler.release(ticket.id);
  }
};
