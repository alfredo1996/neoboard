import { describe, it, expect, beforeEach } from "vitest";
import {
  metricsRegistry,
  recordQuery,
  recordRejection,
  recordQueueTimeout,
  recordCancellation,
  recordRequest,
  resetMetrics,
} from "../index";
import {
  getScheduler,
  resetSchedulerRegistry,
} from "@/lib/query/scheduler-registry";
import { noteConnection } from "../index";

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

  it("a successful query adds one observation to the time and wait histograms", async () => {
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
    expect(
      await sample("neoboard_query_queue_wait_seconds_count", labels),
    ).toBe(1);
  });

  it("a rejection, a queue timeout and a cancellation each increment their own counter", async () => {
    recordRejection("t1", "queue_full");
    recordRejection("t1", "shed");
    recordQueueTimeout("t1");
    recordCancellation("t1");
    expect(
      await sample("neoboard_query_rejections_total", { reason: "queue_full" }),
    ).toBe(1);
    expect(
      await sample("neoboard_query_rejections_total", { reason: "shed" }),
    ).toBe(1);
    expect(
      await sample("neoboard_query_queue_timeouts_total", {
        connector_type: "t1",
      }),
    ).toBe(1);
    expect(
      await sample("neoboard_query_cancellations_total", {
        connector_type: "t1",
      }),
    ).toBe(1);
  });

  it("counts a request by route and status", async () => {
    recordRequest("query", "POST", 200, 12);
    expect(
      await sample("neoboard_http_requests_total", {
        route: "query",
        status: "200",
      }),
    ).toBe(1);
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

  it("never carries a connection, tenant, user, dashboard or query label", async () => {
    recordQuery({
      connectorType: "t1",
      priority: 1,
      outcome: "error",
      waitMs: 1,
      execMs: 1,
    });
    const forbidden = /connection|tenant|user|dashboard|query|^id$|_id$/;
    const json = await metricsRegistry().getMetricsAsJSON();
    const names = new Set(
      json.flatMap((m) => m.values.flatMap((v) => Object.keys(v.labels))),
    );
    expect(names.size).toBeGreaterThan(0);
    expect([...names].filter((n) => forbidden.test(n))).toEqual([]);
  });
});
