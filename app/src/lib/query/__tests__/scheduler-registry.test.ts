import { describe, it, expect, beforeEach } from "vitest";
import {
  getScheduler,
  listSchedulers,
  resetSchedulerRegistry,
  setDefaultSchedulerOptions,
} from "@/lib/query/scheduler-registry";
import type { SchedulerOptions } from "@/lib/query/scheduler";

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
