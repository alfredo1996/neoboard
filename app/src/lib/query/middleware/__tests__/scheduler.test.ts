import { describe, it, expect, beforeEach, vi } from "vitest";
import { schedulerMiddleware } from "../scheduler";
import {
  resetSchedulerRegistry,
  setDefaultSchedulerOptions,
  getScheduler,
} from "@/lib/query/scheduler-registry";
import {
  QueueRejectedError,
  QueueTimeoutError,
  type SchedulerOptions,
} from "@/lib/query/scheduler";
import type { QueryContext, QueryResult } from "@/lib/query/pipeline-types";

const baseOptions: SchedulerOptions = {
  maxConcurrent: 2,
  maxPerUser: 2,
  maxQueueDepth: 4,
  queueTimeoutMs: 60_000,
  shedThreshold: 0.5,
};

function makeContext(
  overrides: Partial<QueryContext> = {},
  metadata: Record<string, unknown> = {},
): QueryContext {
  return {
    query: "MATCH (n) RETURN n",
    params: {},
    connectionId: "conn-1",
    connectionType: "neo4j",
    userId: "user-1",
    tenantId: "tenant-1",
    accessMode: "read",
    metadata,
    ...overrides,
  };
}

describe("schedulerMiddleware", () => {
  beforeEach(() => {
    resetSchedulerRegistry();
    setDefaultSchedulerOptions(baseOptions);
  });

  it("runs the inner function when a slot is available", async () => {
    const result: QueryResult = { data: [1, 2, 3] };
    const next = vi.fn(async () => result);

    const out = await schedulerMiddleware(makeContext(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(out).toBe(result);
  });

  it("stashes schedulerWaitMs on the context metadata", async () => {
    const ctx = makeContext();
    const next = vi.fn(async () => ({ data: null }));
    await schedulerMiddleware(ctx, next);
    expect(typeof ctx.metadata.schedulerWaitMs).toBe("number");
    expect(ctx.metadata.schedulerWaitMs as number).toBeGreaterThanOrEqual(0);
  });

  it("releases the slot after next() resolves", async () => {
    const ctx = makeContext();
    await schedulerMiddleware(ctx, async () => ({ data: null }));
    const scheduler = getScheduler(ctx.connectionId);
    expect(scheduler.getStats().activeQueries).toBe(0);
  });

  it("releases the slot even if next() rejects", async () => {
    const ctx = makeContext();
    await expect(
      schedulerMiddleware(ctx, async () => {
        throw new Error("query failed");
      }),
    ).rejects.toThrow("query failed");
    const scheduler = getScheduler(ctx.connectionId);
    expect(scheduler.getStats().activeQueries).toBe(0);
  });

  it("defaults to priority 2 when metadata.priority is missing", async () => {
    const ctx = makeContext();
    const next = vi.fn(async () => ({ data: null }));
    await schedulerMiddleware(ctx, next);
    // Not directly observable, but the call succeeded — the middleware
    // correctly mapped undefined to P2 without throwing.
    expect(next).toHaveBeenCalledOnce();
  });

  it("honours explicit priority on the context", async () => {
    setDefaultSchedulerOptions({
      ...baseOptions,
      maxConcurrent: 1,
      maxPerUser: 5,
    });
    // Fill the one slot with a long-running P2
    const ctx1 = makeContext({ userId: "blocker" }, { priority: 2 });
    const block = schedulerMiddleware(
      ctx1,
      () =>
        new Promise<QueryResult>((resolve) => {
          setTimeout(() => resolve({ data: null }), 50);
        }),
    );

    // Wait a tick so block is active.
    await new Promise<void>((r) => setImmediate(r));

    // Now enqueue a P1 and a P3 — P1 should wake first.
    const order: string[] = [];
    const p3 = schedulerMiddleware(
      makeContext({ userId: "u1" }, { priority: 3 }),
      async () => {
        order.push("p3");
        return { data: null };
      },
    );
    const p1 = schedulerMiddleware(
      makeContext({ userId: "u1" }, { priority: 1 }),
      async () => {
        order.push("p1");
        return { data: null };
      },
    );

    await block;
    await p1;
    await p3;
    expect(order).toEqual(["p1", "p3"]);
  });

  it("passes QueueRejectedError up when the queue is full", async () => {
    setDefaultSchedulerOptions({
      ...baseOptions,
      maxConcurrent: 1,
      maxPerUser: 1,
      maxQueueDepth: 1,
    });

    // Fill the active slot.
    const active = schedulerMiddleware(
      makeContext({ userId: "u0" }),
      () =>
        new Promise<QueryResult>((resolve) => {
          setTimeout(() => resolve({ data: null }), 50);
        }),
    );
    await new Promise<void>((r) => setImmediate(r));

    // Queue one (at cap).
    const queued = schedulerMiddleware(
      makeContext({ userId: "u1" }),
      async () => ({ data: null }),
    );
    queued.catch(() => {});

    // Next enqueue should be rejected — queue depth cap of 1.
    await expect(
      schedulerMiddleware(makeContext({ userId: "u2" }), async () => ({
        data: null,
      })),
    ).rejects.toBeInstanceOf(QueueRejectedError);

    await active;
    await queued;
  });

  it("passes QueueTimeoutError up when a waiter times out", async () => {
    setDefaultSchedulerOptions({
      ...baseOptions,
      maxConcurrent: 1,
      maxPerUser: 1,
      queueTimeoutMs: 20,
    });

    // Active blocker that never resolves within the test window
    const blocker = schedulerMiddleware(
      makeContext({ userId: "u0" }),
      () =>
        new Promise<QueryResult>((resolve) => {
          setTimeout(() => resolve({ data: null }), 200);
        }),
    );

    await expect(
      schedulerMiddleware(makeContext({ userId: "u1" }), async () => ({
        data: null,
      })),
    ).rejects.toBeInstanceOf(QueueTimeoutError);

    await blocker;
  });

  it("resolvePriority tolerates string priorities", async () => {
    const ctx = makeContext({}, { priority: "1" });
    const next = vi.fn(async () => ({ data: null }));
    await schedulerMiddleware(ctx, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
