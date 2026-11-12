import { describe, it, expect, beforeEach } from "vitest";
import {
  metricsRegistry,
  recordQuery,
  recordRejection,
  recordQueueTimeout,
  recordCancellation,
  noteConnection,
  recordRequest,
  resetMetrics,
} from "../index";
import {
  getScheduler,
  setDefaultSchedulerOptions,
  resetSchedulerRegistry,
} from "@/lib/query/scheduler-registry";

/** Value of the sample `name` whose labels include `labels`, or undefined. */
async function sample(name: string, labels: Record<string, string> = {}) {
  const json = await metricsRegistry().getMetricsAsJSON();
  for (const metric of json) {
    const hit = metric.values.find((v) => {
      const l = v.labels as Record<string, string>;
      const sampleName =
        (v as { metricName?: string }).metricName ?? metric.name;
      return (
        sampleName === name &&
        Object.entries(labels).every(([k, x]) => l[k] === x)
      );
    });
    if (hit) return hit.value;
  }
  return undefined;
}

describe("metrics", () => {
  beforeEach(() => {
    resetMetrics();
    resetSchedulerRegistry();
  });

  it("records the execution and the wait in seconds, each in its own histogram", async () => {
    recordQuery({
      connectorType: "t1",
      priority: 2,
      outcome: "success",
      waitMs: 40,
      execMs: 250,
    });
    const labels = { connector_type: "t1", priority: "2", outcome: "success" };
    expect(await sample("neoboard_query_duration_seconds_count", labels)).toBe(
      1,
    );
    expect(await sample("neoboard_query_duration_seconds_sum", labels)).toBe(
      0.25,
    );
    expect(await sample("neoboard_query_queue_wait_seconds_sum", labels)).toBe(
      0.04,
    );
  });

  it("a queue timeout adds its wait, in seconds, under the queue_timeout outcome", async () => {
    recordQueueTimeout("t1", 3, 500);
    expect(
      await sample("neoboard_query_queue_wait_seconds_sum", {
        priority: "3",
        outcome: "queue_timeout",
      }),
    ).toBe(0.5);
  });

  it("exposes the default process metrics", async () => {
    expect(await metricsRegistry().metrics()).toContain(
      "neoboard_process_cpu_user_seconds_total",
    );
  });

  it("reports active queries per connector type from the schedulers", async () => {
    noteConnection("c-1", "t1");
    const scheduler = getScheduler("c-1");
    await scheduler.enqueue({
      id: "a",
      userId: "u",
      connectorId: "c-1",
      priority: 2,
      enqueuedAt: Date.now(),
    });
    expect(
      await sample("neoboard_query_active", { connector_type: "t1" }),
    ).toBe(1);
  });

  it("reports the queue depth per connector type", async () => {
    noteConnection("c-2", "t1");
    setDefaultSchedulerOptions({
      maxConcurrent: 1,
      maxPerUser: 1,
      maxQueueDepth: 4,
      queueTimeoutMs: 60_000,
      shedThreshold: 1,
    });
    const scheduler = getScheduler("c-2");
    const ticket = (id: string) => ({
      id,
      userId: id,
      connectorId: "c-2",
      priority: 2 as const,
      enqueuedAt: Date.now(),
    });
    await scheduler.enqueue(ticket("run"));
    // Fills every slot, so the next one waits; its promise settles on release.
    const waiting = scheduler.enqueue(ticket("wait"));
    expect(
      await sample("neoboard_query_queue_depth", { connector_type: "t1" }),
    ).toBe(1);
    scheduler.release("run");
    await waiting;
  });

  it("no metric declares a connection, tenant, user, dashboard or query label", async () => {
    recordQuery({
      connectorType: "t1",
      priority: 1,
      outcome: "error",
      waitMs: 1,
      execMs: 1,
    });
    recordRejection("t1", "connector_unavailable");
    recordQueueTimeout("t1", 1, 1);
    recordCancellation("t1");
    recordRequest("query", "POST", 200, 1);
    const forbidden = /connection|tenant|user|dashboard|query|^id$|_id$/;
    // Declared names, not observed samples: a label on a metric with no
    // sample yet would otherwise slip through.
    const names = metricsRegistry()
      .getMetricsAsArray()
      .flatMap(
        (metric) => (metric as { labelNames?: string[] }).labelNames ?? [],
      );
    expect(names).toContain("connector_type");
    expect(names.filter((n) => forbidden.test(n))).toEqual([]);
  });
});
