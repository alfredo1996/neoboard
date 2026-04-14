import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  QueryScheduler,
  QueueRejectedError,
  QueueTimeoutError,
  type SchedulerOptions,
  type QueryTicket,
  type QueryPriority,
} from "@/lib/query/scheduler";

function opts(partial: Partial<SchedulerOptions> = {}): SchedulerOptions {
  return {
    maxConcurrent: 2,
    maxPerUser: 2,
    maxQueueDepth: 10,
    // Large enough that real-timer tests never race the timeout. The
    // dedicated timeout describe block overrides this with fake timers.
    queueTimeoutMs: 60_000,
    shedThreshold: 0.8,
    ...partial,
  };
}

let nextId = 0;
function ticket(
  userId: string,
  priority: QueryPriority = 2,
  enqueuedAt = Date.now(),
): QueryTicket {
  return {
    id: `t${++nextId}`,
    userId,
    connectorId: "conn-1",
    priority,
    enqueuedAt,
  };
}

describe("QueryScheduler — fast path (slot available)", () => {
  beforeEach(() => {
    nextId = 0;
  });

  it("grants immediately when under concurrency cap", async () => {
    const s = new QueryScheduler(opts());
    await expect(s.enqueue(ticket("u1"))).resolves.toBeUndefined();
    expect(s.getStats().activeQueries).toBe(1);
    expect(s.getStats().queueDepth).toBe(0);
  });

  it("tracks multiple in-flight tickets", async () => {
    const s = new QueryScheduler(opts({ maxConcurrent: 3, maxPerUser: 3 }));
    await s.enqueue(ticket("u1"));
    await s.enqueue(ticket("u1"));
    await s.enqueue(ticket("u2"));
    const stats = s.getStats();
    expect(stats.activeQueries).toBe(3);
    expect(stats.activeByUser).toEqual({ u1: 2, u2: 1 });
  });

  it("release() decrements active counts", async () => {
    const s = new QueryScheduler(opts());
    const t = ticket("u1");
    await s.enqueue(t);
    expect(s.getStats().activeQueries).toBe(1);
    s.release(t.id);
    expect(s.getStats().activeQueries).toBe(0);
    expect(s.getStats().activeByUser).toEqual({});
  });

  it("release() of unknown id is a no-op", () => {
    const s = new QueryScheduler(opts());
    expect(() => s.release("never-seen")).not.toThrow();
  });
});

describe("QueryScheduler — slot wait and wake", () => {
  beforeEach(() => {
    nextId = 0;
  });

  it("queues when concurrency is full and resolves on release", async () => {
    const s = new QueryScheduler(opts({ maxConcurrent: 1, maxPerUser: 5 }));
    const t1 = ticket("u1");
    const t2 = ticket("u2");
    await s.enqueue(t1);

    let resolved = false;
    const pending = s.enqueue(t2).then(() => {
      resolved = true;
    });

    // t2 is queued, not yet running
    expect(s.getStats().activeQueries).toBe(1);
    expect(s.getStats().queueDepth).toBe(1);
    expect(resolved).toBe(false);

    s.release(t1.id);
    await pending;
    expect(resolved).toBe(true);
    expect(s.getStats().activeQueries).toBe(1);
    expect(s.getStats().queueDepth).toBe(0);
  });

  it("respects per-user cap even when global capacity is free", async () => {
    const s = new QueryScheduler(opts({ maxConcurrent: 10, maxPerUser: 1 }));
    const t1 = ticket("u1");
    await s.enqueue(t1);

    let resolved = false;
    const t2 = ticket("u1");
    const pending = s.enqueue(t2).then(() => {
      resolved = true;
    });

    // Global cap not hit (1/10) but per-user cap is (1/1).
    expect(s.getStats().queueDepth).toBe(1);
    expect(resolved).toBe(false);

    s.release(t1.id);
    await pending;
    expect(resolved).toBe(true);
  });

  it("skips a user that is still at their per-user cap when waking", async () => {
    // maxConcurrent=2, maxPerUser=1 — u1 will be stuck at 1/1 while u2
    // has an active ticket too. u1 queues a second ticket (blocked by
    // per-user cap). u3 queues a ticket (blocked by global cap). When
    // u2 releases, we free a global slot — u1 still cannot claim it
    // (per-user cap) so we must skip u1 and wake u3 instead.
    const s = new QueryScheduler(opts({ maxConcurrent: 2, maxPerUser: 1 }));
    const t1a = ticket("u1");
    const t2a = ticket("u2");
    await s.enqueue(t1a);
    await s.enqueue(t2a);
    expect(s.getStats().activeQueries).toBe(2);

    const order: string[] = [];
    const t1b = ticket("u1");
    const t3 = ticket("u3");
    const w1b = s.enqueue(t1b).then(() => order.push("u1b"));
    const w3 = s.enqueue(t3).then(() => order.push("u3"));

    // Release u2 — should wake u3 (u1 skipped because u1 still at 1/1).
    s.release(t2a.id);
    await w3;
    expect(order).toEqual(["u3"]);

    // Now release u1's active ticket — u1 drops to 0/1 and u1b wakes.
    s.release(t1a.id);
    await w1b;
    expect(order).toEqual(["u3", "u1b"]);
  });
});

describe("QueryScheduler — priority ordering", () => {
  beforeEach(() => {
    nextId = 0;
  });

  it("P1 waiters wake before P2 and P3", async () => {
    const s = new QueryScheduler(opts({ maxConcurrent: 1, maxPerUser: 3 }));
    const blocker = ticket("blocker", 1);
    await s.enqueue(blocker);

    const order: string[] = [];
    const p3 = s.enqueue(ticket("u1", 3)).then(() => order.push("p3"));
    const p2 = s.enqueue(ticket("u1", 2)).then(() => order.push("p2"));
    const p1 = s.enqueue(ticket("u1", 1)).then(() => order.push("p1"));

    // Release blocker → P1 wakes first (priority wins over FIFO order).
    s.release(blocker.id);
    await p1;
    expect(order).toEqual(["p1"]);
    expect(s.getStats().activeQueries).toBe(1);

    // Release whatever is currently active → P2 wakes next.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const active1 = [...(s as any).active.keys()][0] as string;
    s.release(active1);
    await p2;
    expect(order).toEqual(["p1", "p2"]);

    // Finally P3.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const active2 = [...(s as any).active.keys()][0] as string;
    s.release(active2);
    await p3;
    expect(order).toEqual(["p1", "p2", "p3"]);
  });
});

describe("QueryScheduler — per-user fairness (round robin)", () => {
  beforeEach(() => {
    nextId = 0;
  });

  it("dequeues users in round-robin order within a priority tier", async () => {
    const s = new QueryScheduler(opts({ maxConcurrent: 1, maxPerUser: 5 }));
    const blocker = ticket("blocker");
    await s.enqueue(blocker);

    const order: string[] = [];
    const pendings = [
      s.enqueue(ticket("A")).then(() => order.push("A1")),
      s.enqueue(ticket("A")).then(() => order.push("A2")),
      s.enqueue(ticket("A")).then(() => order.push("A3")),
      s.enqueue(ticket("B")).then(() => order.push("B1")),
      s.enqueue(ticket("C")).then(() => order.push("C1")),
      s.enqueue(ticket("C")).then(() => order.push("C2")),
    ];

    // Release blocker → A1 wakes (first enqueued).
    s.release(blocker.id);
    await order.length;

    // Cascade: each release wakes the next in round-robin order.
    // Drain the whole queue.
    while (order.length < 6) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const active = [...(s as any).active.keys()];
      if (active.length === 0) break;
      s.release(active[0]);
      // Let the promise resolve
      await new Promise<void>((r) => setImmediate(r));
    }
    await Promise.all(pendings);

    // Round-robin across A, B, C starting with whoever was first in.
    // A is first in so it gets first dequeue; then B, then C; then A
    // again because A still has items; then C (B has none left); then
    // A (C has none left).
    expect(order).toEqual(["A1", "B1", "C1", "A2", "C2", "A3"]);
  });
});

describe("QueryScheduler — queue depth limit", () => {
  beforeEach(() => {
    nextId = 0;
  });

  it("rejects with QueueRejectedError(queue_full) when depth reached", async () => {
    const s = new QueryScheduler(
      opts({ maxConcurrent: 1, maxPerUser: 1, maxQueueDepth: 2 }),
    );
    await s.enqueue(ticket("u0")); // active, not queued
    const p1 = s.enqueue(ticket("u1")); // queued (1)
    const p2 = s.enqueue(ticket("u2")); // queued (2)

    // Swallow the to-be-settled promises so vitest doesn't flag them

    p1.catch(() => {});

    p2.catch(() => {});

    await expect(s.enqueue(ticket("u3"))).rejects.toBeInstanceOf(
      QueueRejectedError,
    );

    expect(s.getStats().rejectionsTotal).toBe(1);
  });
});

describe("QueryScheduler — priority shedding", () => {
  beforeEach(() => {
    nextId = 0;
  });

  it("sheds P3 when queue is above shedThreshold", async () => {
    const s = new QueryScheduler(
      opts({
        maxConcurrent: 1,
        maxPerUser: 5,
        maxQueueDepth: 10,
        shedThreshold: 0.5,
      }),
    );
    await s.enqueue(ticket("u0")); // active

    // Enqueue 5 queued waiters at P2 → depth = 5, threshold = 5
    const pending: Promise<void>[] = [];
    for (let i = 0; i < 5; i++) {
      pending.push(s.enqueue(ticket("u1", 2)));
    }
    pending.forEach((p) => p.catch(() => {}));

    // A new P3 should now be shed (depth 5 >= 10*0.5 = 5).
    try {
      await s.enqueue(ticket("u2", 3));
      throw new Error("should have been shed");
    } catch (err) {
      expect(err).toBeInstanceOf(QueueRejectedError);
      expect((err as QueueRejectedError).reason).toBe("shed");
    }
    expect(s.getStats().shedTotal).toBe(1);

    // P1 at the same depth is NOT shed.
    const p1 = s.enqueue(ticket("u3", 1));
    p1.catch(() => {});
    expect(s.getStats().shedTotal).toBe(1); // unchanged
  });

  it("does not shed P3 when queue is below threshold", async () => {
    const s = new QueryScheduler(
      opts({ maxConcurrent: 1, maxQueueDepth: 10, shedThreshold: 0.8 }),
    );
    await s.enqueue(ticket("u0"));
    const p = s.enqueue(ticket("u1", 3));
    p.catch(() => {});
    expect(s.getStats().shedTotal).toBe(0);
    expect(s.getStats().queueDepth).toBe(1);
  });
});

describe("QueryScheduler — queue timeout", () => {
  beforeEach(() => {
    nextId = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects waiters that exceed queueTimeoutMs", async () => {
    const s = new QueryScheduler(
      opts({ maxConcurrent: 1, queueTimeoutMs: 500 }),
    );
    await s.enqueue(ticket("u0")); // active

    const pending = s.enqueue(ticket("u1"));
    // Don't await yet — advance time past the timeout.
    vi.advanceTimersByTime(501);
    await expect(pending).rejects.toBeInstanceOf(QueueTimeoutError);

    // Queue should be empty after the reject.
    expect(s.getStats().queueDepth).toBe(0);
  });

  it("does NOT time out waiters that wake before the deadline", async () => {
    const s = new QueryScheduler(
      opts({ maxConcurrent: 1, queueTimeoutMs: 1_000 }),
    );
    const t0 = ticket("u0");
    await s.enqueue(t0);
    const pending = s.enqueue(ticket("u1"));

    vi.advanceTimersByTime(200);
    s.release(t0.id);
    await expect(pending).resolves.toBeUndefined();
  });
});

describe("QueryScheduler — shutdown", () => {
  beforeEach(() => {
    nextId = 0;
  });

  it("rejects all pending waiters on shutdown()", async () => {
    const s = new QueryScheduler(opts({ maxConcurrent: 1 }));
    await s.enqueue(ticket("u0")); // active
    const w1 = s.enqueue(ticket("u1"));
    const w2 = s.enqueue(ticket("u2"));

    s.shutdown();
    await expect(w1).rejects.toThrow(/shutting down/);
    await expect(w2).rejects.toThrow(/shutting down/);
  });

  it("rejects new enqueues after shutdown", async () => {
    const s = new QueryScheduler(opts());
    s.shutdown();
    await expect(s.enqueue(ticket("u1"))).rejects.toThrow(/shutting down/);
  });
});

describe("QueryScheduler — getStats", () => {
  beforeEach(() => {
    nextId = 0;
  });

  it("returns a full snapshot shape", async () => {
    const s = new QueryScheduler(opts());
    const stats = s.getStats();
    expect(stats).toMatchObject({
      queueDepth: 0,
      queueDepthByPriority: { p1: 0, p2: 0, p3: 0 },
      activeQueries: 0,
      activeByUser: {},
      rejectionsTotal: 0,
      shedTotal: 0,
      avgWaitMs: 0,
    });
  });

  it("counts queue depth per priority separately", async () => {
    const s = new QueryScheduler(opts({ maxConcurrent: 1, maxPerUser: 5 }));
    await s.enqueue(ticket("u0")); // blocks the only slot

    const pendings = [
      s.enqueue(ticket("u1", 1)),
      s.enqueue(ticket("u1", 2)),
      s.enqueue(ticket("u1", 2)),
      s.enqueue(ticket("u1", 3)),
    ];
    pendings.forEach((p) => p.catch(() => {}));

    const stats = s.getStats();
    expect(stats.queueDepth).toBe(4);
    expect(stats.queueDepthByPriority).toEqual({ p1: 1, p2: 2, p3: 1 });
  });
});
