import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getScheduler,
  listSchedulers,
  resetSchedulerRegistry,
  setDefaultSchedulerOptions,
} from "@/lib/query/scheduler-registry";
import type { SchedulerOptions } from "@/lib/query/scheduler";
import { applySettingRows } from "@/lib/settings/core";

const testOptions: SchedulerOptions = {
  maxConcurrent: 3,
  maxPerUser: 2,
  maxQueueDepth: 10,
  queueTimeoutMs: 60_000,
  shedThreshold: 0.8,
};

describe("scheduler-registry", () => {
  beforeEach(() => {
    resetSchedulerRegistry();
    setDefaultSchedulerOptions(testOptions);
  });

  // #2416: an admin's change reaches schedulers that already exist.
  describe("a changed setting", () => {
    const ticket = (id: string, userId = "u1") => ({
      id,
      userId,
      connectorId: "conn-live",
      priority: 2 as const,
      enqueuedAt: Date.now(),
    });
    const row = (key: string, value: unknown) => ({
      key,
      value,
      updatedBy: null,
      updatedAt: null,
    });
    const oneSlot = { ...testOptions, maxConcurrent: 1, maxPerUser: 1 };

    it("lets queued queries in on a raised cap and leaves the running one alone", async () => {
      setDefaultSchedulerOptions(oneSlot);
      const s = getScheduler("conn-live");
      await s.enqueue(ticket("running"));
      let started = false;
      const queued = s.enqueue(ticket("queued", "u2")).then(() => {
        started = true;
      });
      expect(started).toBe(false);

      applySettingRows([
        row("QUERY_MAX_CONCURRENT", 2),
        row("QUERY_MAX_PER_USER", 2),
      ]);
      await queued;

      expect(started).toBe(true);
      expect(s.getStats().activeQueries).toBe(2);
      applySettingRows([]);
    });

    it("refuses new arrivals past a lowered queue depth, keeping the queued ones", async () => {
      setDefaultSchedulerOptions(oneSlot);
      const s = getScheduler("conn-live");
      await s.enqueue(ticket("running"));
      s.enqueue(ticket("q1", "u2")).catch(() => {});
      s.enqueue(ticket("q2", "u3")).catch(() => {});
      expect(s.getStats().queueDepth).toBe(2);

      // A change replaces the whole config, so pin the one-slot caps too.
      applySettingRows([
        row("QUERY_MAX_CONCURRENT", 1),
        row("QUERY_MAX_PER_USER", 1),
        row("QUERY_MAX_QUEUE_DEPTH", 1),
      ]);

      await expect(s.enqueue(ticket("q3", "u4"))).rejects.toThrow();
      expect(s.getStats().queueDepth).toBe(2);
      applySettingRows([]);
    });
  });

  it("returns the same instance for repeated getScheduler calls", () => {
    const a = getScheduler("conn-1");
    const b = getScheduler("conn-1");
    expect(a).toBe(b);
  });

  it("returns distinct instances per connection id", () => {
    const a = getScheduler("conn-1");
    const b = getScheduler("conn-2");
    expect(a).not.toBe(b);
  });

  it("lists all schedulers currently held", () => {
    getScheduler("conn-1");
    getScheduler("conn-2");
    const list = listSchedulers();
    expect(list).toHaveLength(2);
    const ids = list.map((e) => e.connectionId).sort();
    expect(ids).toEqual(["conn-1", "conn-2"]);
  });

  it("reset clears the registry and shuts down existing schedulers", async () => {
    const s = getScheduler("conn-1");
    resetSchedulerRegistry();
    expect(listSchedulers()).toEqual([]);
    // The old scheduler should reject new enqueues because it was shut down.
    await expect(
      s.enqueue({
        id: "t1",
        userId: "u1",
        connectorId: "conn-1",
        priority: 2,
        enqueuedAt: Date.now(),
      }),
    ).rejects.toThrow(/shutting down/);
  });

  it("respects setDefaultSchedulerOptions for newly constructed schedulers", async () => {
    setDefaultSchedulerOptions({
      ...testOptions,
      maxConcurrent: 1,
      maxPerUser: 1,
    });
    const s = getScheduler("conn-3");
    // Enqueue twice from the same user — second one should queue.
    await s.enqueue({
      id: "t1",
      userId: "u1",
      connectorId: "conn-3",
      priority: 2,
      enqueuedAt: Date.now(),
    });
    const pending = s.enqueue({
      id: "t2",
      userId: "u1",
      connectorId: "conn-3",
      priority: 2,
      enqueuedAt: Date.now(),
    });
    pending.catch(() => {});
    expect(s.getStats().queueDepth).toBe(1);
  });

  // #1426: a production Next build gives instrumentation.ts and every route
  // handler their own copy of this module (#1888). The scheduler middleware
  // runs from instrumentation's copy and the connection-test route from its
  // own, so a module-level Map gave one connection two schedulers and two
  // budgets. `vi.resetModules()` is that second bundle.
  it("hands every copy of the module the same scheduler for a connection", async () => {
    const first = getScheduler("conn-shared");
    vi.resetModules();
    const secondCopy = await import("@/lib/query/scheduler-registry");
    expect(secondCopy.getScheduler).not.toBe(getScheduler);
    expect(secondCopy.getScheduler("conn-shared")).toBe(first);
    expect(secondCopy.listSchedulers().map((e) => e.connectionId)).toEqual([
      "conn-shared",
    ]);
  });

  it("accepts an explicit options override per call", () => {
    const s = getScheduler("conn-override", {
      ...testOptions,
      maxConcurrent: 99,
    });
    // Can't introspect options directly, but the scheduler should
    // exist and be reachable via listSchedulers.
    expect(s).toBeDefined();
    expect(
      listSchedulers().find((e) => e.connectionId === "conn-override"),
    ).toBeDefined();
  });
});
