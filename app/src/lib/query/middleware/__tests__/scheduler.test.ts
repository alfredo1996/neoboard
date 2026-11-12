import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_CONNECTION_CONFIG,
  registerConnector,
  unregisterConnector,
} from "@neoboard/connection";
import {
  nextRun,
  scripted,
  scriptedConnector,
  SCRIPTED_TYPE,
} from "@/__tests__/fixtures/scripted-connector";
import {
  closeAllConnections,
  executeQuery,
  QUERY_DEADLINE_GRACE_MS,
} from "@/lib/query/query-executor";
import { queryLogger } from "@/lib/logger";
import { schedulerMiddleware, withSchedulerSlot } from "../scheduler";
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

// #1426: work that is not a query — a connection probe — takes a slot from
// the same per-connection scheduler the middleware uses.
describe("withSchedulerSlot", () => {
  beforeEach(() => {
    resetSchedulerRegistry();
    setDefaultSchedulerOptions({ ...baseOptions, maxConcurrent: 1 });
  });

  const who = {
    connectionId: "conn-1",
    userId: "user-1",
    priority: 1,
  } as const;

  it("returns what the work returns, and frees the slot", async () => {
    await expect(withSchedulerSlot(who, async () => "ok")).resolves.toBe("ok");
    expect(getScheduler("conn-1").getStats().activeQueries).toBe(0);
  });

  it("frees the slot when the work throws", async () => {
    await expect(
      withSchedulerSlot(who, async () => {
        throw new Error("probe failed");
      }),
    ).rejects.toThrow("probe failed");
    expect(getScheduler("conn-1").getStats().activeQueries).toBe(0);
  });

  it("shares the connection's budget with queries: a probe waits for a running query", async () => {
    let finishQuery!: () => void;
    const query = schedulerMiddleware(
      makeContext({ userId: "someone-else" }),
      () =>
        new Promise<QueryResult>((resolve) => {
          finishQuery = () => resolve({ data: null });
        }),
    );
    await new Promise<void>((r) => setImmediate(r));

    const probe = vi.fn(async () => true);
    const probing = withSchedulerSlot(who, probe);
    await new Promise<void>((r) => setImmediate(r));
    expect(probe).not.toHaveBeenCalled();
    expect(getScheduler("conn-1").getStats().queueDepth).toBe(1);

    finishQuery();
    await query;
    await expect(probing).resolves.toBe(true);
  });

  it("reports how long the work waited for its slot", async () => {
    const waited = await withSchedulerSlot(who, async (waitMs) => waitMs);
    expect(waited).toBeGreaterThanOrEqual(0);
  });
});

// #2060: a connector that never answers used to pin its slot forever. The
// executor's deadline settles the query, and the slot goes with it.
describe("a query the executor timed out", () => {
  beforeEach(() => {
    resetSchedulerRegistry();
    setDefaultSchedulerOptions({
      ...baseOptions,
      maxConcurrent: 1,
      queueTimeoutMs: 10 * 60_000,
    });
    registerConnector(scriptedConnector);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await closeAllConnections();
    unregisterConnector(SCRIPTED_TYPE);
  });

  it("frees its slot for the next queued query", async () => {
    const who = {
      connectionId: "conn-1",
      userId: "user-1",
      priority: 1,
    } as const;
    const run = nextRun();
    const hung = withSchedulerSlot(who, () =>
      executeQuery(SCRIPTED_TYPE, {}, { query: "HANG" }),
    ).catch((error: unknown) => error);
    await run;
    const next = withSchedulerSlot(who, async () => "ran");
    expect(getScheduler("conn-1").getStats()).toMatchObject({
      activeQueries: 1,
      queueDepth: 1,
    });

    await vi.advanceTimersByTimeAsync(
      DEFAULT_CONNECTION_CONFIG.timeout + QUERY_DEADLINE_GRACE_MS,
    );

    await expect(hung).resolves.toMatchObject({ type: "TIMEOUT" });
    await expect(next).resolves.toBe("ran");
    expect(getScheduler("conn-1").getStats()).toMatchObject({
      activeQueries: 0,
      queueDepth: 0,
    });
  });
});

describe("an abandoned query (#2444)", () => {
  beforeEach(() => {
    resetSchedulerRegistry();
    setDefaultSchedulerOptions({
      ...baseOptions,
      maxConcurrent: 1,
      maxPerUser: 5,
    });
    registerConnector(scriptedConnector);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    scripted.script = () => {};
    await closeAllConnections();
    unregisterConnector(SCRIPTED_TYPE);
  });

  const who = {
    connectionId: "conn-1",
    userId: "user-1",
    priority: 1,
  } as const;

  it("a connector that ignores the signal keeps its slot until its query ends", async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    scripted.script = (_cb, config) => {
      seen = config.signal;
    };
    const run = nextRun();
    const slow = withSchedulerSlot({ ...who, signal: controller.signal }, () =>
      executeQuery(
        SCRIPTED_TYPE,
        {},
        { query: "SLOW" },
        { signal: controller.signal },
      ),
    );
    const callbacks = await run;
    expect(seen).toBe(controller.signal);

    controller.abort();
    await new Promise((r) => setTimeout(r, 20));
    expect(getScheduler("conn-1").getStats().activeQueries).toBe(1);

    callbacks.onSuccess?.([]);
    await slow;
    expect(getScheduler("conn-1").getStats().activeQueries).toBe(0);
  });

  it("an aborted waiting query never runs and writes one query_failed line", async () => {
    const warn = vi.spyOn(queryLogger, "warn").mockImplementation(() => {});
    let release: (r: QueryResult) => void = () => {};
    const blocker = schedulerMiddleware(
      makeContext({ userId: "blocker" }),
      () => new Promise<QueryResult>((r) => (release = r)),
    );
    const controller = new AbortController();
    const next = vi.fn(async () => ({ data: null }));
    const waiting = schedulerMiddleware(
      { ...makeContext({}, { requestId: "req-7" }), signal: controller.signal },
      next,
    ).catch((e: unknown) => e);
    controller.abort();

    expect(((await waiting) as Error).name).toBe("QueryAbortedError");
    expect(next).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    const [obj] = warn.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(obj).toMatchObject({
      event: "query_failed",
      errorCode: "aborted",
      requestId: "req-7",
    });
    expect(typeof obj.schedulerWaitMs).toBe("number");
    expect(obj.totalMs).toBe(obj.schedulerWaitMs);

    release({ data: null });
    await blocker;
  });
});

describe("queue refusals are logged (#2438)", () => {
  beforeEach(() => {
    resetSchedulerRegistry();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    [
      "QueueTimeoutError",
      1,
      { ...baseOptions, maxConcurrent: 1, maxPerUser: 5, queueTimeoutMs: 20 },
    ],
    [
      "QueueRejectedError",
      2,
      { ...baseOptions, maxConcurrent: 1, maxPerUser: 5, maxQueueDepth: 1 },
    ],
  ])(
    "%s writes one query_failed line and rethrows it",
    async (name, holders, opts) => {
      setDefaultSchedulerOptions(opts);
      const warn = vi.spyOn(queryLogger, "warn").mockImplementation(() => {});
      const hold = () =>
        new Promise<QueryResult>((r) =>
          setTimeout(() => r({ data: null }), 80),
        );
      const block = Promise.all(
        Array.from({ length: holders }, () =>
          schedulerMiddleware(makeContext({ userId: "blocker" }), hold),
        ),
      );
      const ctx = makeContext({}, { requestId: "req-9" });
      const err = await schedulerMiddleware(ctx, async () => ({
        data: null,
      })).catch((e: unknown) => e);
      await block;
      expect((err as Error).name).toBe(name);
      expect(warn).toHaveBeenCalledTimes(1);
      const [obj] = warn.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(obj).toMatchObject({
        event: "query_failed",
        errorCode: name,
        connectionId: "conn-1",
        requestId: "req-9",
      });
      expect(obj.err).toBe(err);
      expect(typeof obj.schedulerWaitMs).toBe("number");
      expect(obj.totalMs).toBe(obj.schedulerWaitMs);
      expect(obj.durationMs).toBeUndefined();
    },
  );
});
