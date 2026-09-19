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
  who: { connectionId: string; userId: string; priority: QueryPriority },
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

  await scheduler.enqueue(ticket);
  try {
    return await work(Date.now() - ticket.enqueuedAt);
  } finally {
    scheduler.release(ticket.id);
  }
}

export const schedulerMiddleware: QueryMiddlewareFn = (
  ctx,
  next,
): Promise<QueryResult> =>
  withSchedulerSlot(
    {
      connectionId: ctx.connectionId,
      userId: ctx.userId,
      priority: resolvePriority(ctx.metadata.priority),
    },
    (waitMs) => {
      ctx.metadata.schedulerWaitMs = waitMs;
      return next();
    },
  );
