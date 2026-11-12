import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";
import { PRODUCT_NAME } from "@/lib/branding";
import { listSchedulers } from "@/lib/query/scheduler-registry";

/**
 * Prometheus metrics (#2440).
 *
 * Labels are bounded on purpose: connector type, priority, outcome, route,
 * status. Never a connection, tenant, user, dashboard or query text. The
 * connector type is read off the connection at runtime, so a new connector
 * needs no change here.
 *
 * The registry lives on globalThis: a production build gives instrumentation
 * and each route its own copy of this module (#1888).
 */

const PREFIX = `${PRODUCT_NAME.toLowerCase()}_`;
const SECONDS_BUCKETS = [0.005, 0.025, 0.1, 0.5, 1, 2.5, 5, 10, 30];

export type QueryOutcome = "success" | "error";
export type RejectionReason = "queue_full" | "shed" | "connector_unavailable";

interface Metrics {
  registry: Registry;
  queryDuration: Histogram<string>;
  queueWait: Histogram<string>;
  rejections: Counter<string>;
  queueTimeouts: Counter<string>;
  cancellations: Counter<string>;
  queueDepth: Gauge<string>;
  active: Gauge<string>;
  httpRequests: Counter<string>;
  httpDuration: Histogram<string>;
  /** connection id -> connector type, internal only (never a label). */
  connectionTypes: Map<string, string>;
}

const g = globalThis as typeof globalThis & { __neoboardMetrics?: Metrics };

function build(): Metrics {
  const registry = new Registry();
  const connectionTypes = new Map<string, string>();
  collectDefaultMetrics({ register: registry, prefix: PREFIX });

  /** Sum a scheduler stat per connector type, at scrape time. */
  const perType = (
    pick: (
      s: ReturnType<
        ReturnType<typeof listSchedulers>[number]["scheduler"]["getStats"]
      >,
    ) => number,
  ) =>
    function (this: Gauge<string>) {
      this.reset();
      const sums = new Map<string, number>();
      for (const { connectionId, scheduler } of listSchedulers()) {
        const type = connectionTypes.get(connectionId) ?? "unknown";
        sums.set(type, (sums.get(type) ?? 0) + pick(scheduler.getStats()));
      }
      for (const [type, value] of sums)
        this.set({ connector_type: type }, value);
    };

  const queueDepth = new Gauge({
    name: `${PREFIX}query_queue_depth`,
    help: "Queries waiting for a slot, by connector type.",
    labelNames: ["connector_type"],
    registers: [registry],
    collect: perType((s) => s.queueDepth),
  });
  const active = new Gauge({
    name: `${PREFIX}query_active`,
    help: "Queries running now, by connector type.",
    labelNames: ["connector_type"],
    registers: [registry],
    collect: perType((s) => s.activeQueries),
  });

  return {
    registry,
    connectionTypes,
    queueDepth,
    active,
    queryDuration: new Histogram({
      name: `${PREFIX}query_duration_seconds`,
      help: "Connector execution time of a query, queue wait excluded.",
      labelNames: ["connector_type", "priority", "outcome"],
      buckets: SECONDS_BUCKETS,
      registers: [registry],
    }),
    queueWait: new Histogram({
      name: `${PREFIX}query_queue_wait_seconds`,
      help: "Time a query waited for a scheduler slot.",
      labelNames: ["connector_type", "priority", "outcome"],
      buckets: SECONDS_BUCKETS,
      registers: [registry],
    }),
    rejections: new Counter({
      name: `${PREFIX}query_rejections_total`,
      help: "Queries refused before running: queue full, shed under load, or a connector known to be down.",
      labelNames: ["connector_type", "reason"],
      registers: [registry],
    }),
    queueTimeouts: new Counter({
      name: `${PREFIX}query_queue_timeouts_total`,
      help: "Queries that waited in the queue past the queue timeout.",
      labelNames: ["connector_type"],
      registers: [registry],
    }),
    cancellations: new Counter({
      name: `${PREFIX}query_cancellations_total`,
      help: "Queries cancelled by the client.",
      labelNames: ["connector_type"],
      registers: [registry],
    }),
    httpRequests: new Counter({
      name: `${PREFIX}http_requests_total`,
      help: "API requests by route and status.",
      labelNames: ["route", "method", "status"],
      registers: [registry],
    }),
    httpDuration: new Histogram({
      name: `${PREFIX}http_request_duration_seconds`,
      help: "API request time by route and status.",
      labelNames: ["route", "method", "status"],
      buckets: SECONDS_BUCKETS,
      registers: [registry],
    }),
  };
}

function m(): Metrics {
  g.__neoboardMetrics ??= build();
  return g.__neoboardMetrics;
}

export function metricsRegistry(): Registry {
  return m().registry;
}

/** Tests only: drop the registry so the next call builds a fresh one. */
export function resetMetrics(): void {
  m().registry.clear();
  g.__neoboardMetrics = undefined;
}

/** Remember a connection's connector type so scheduler gauges can group by it. */
export function noteConnection(connectionId: string, connectorType: string) {
  m().connectionTypes.set(connectionId, connectorType);
}

export function recordQuery(o: {
  connectorType: string;
  priority: 1 | 2 | 3;
  outcome: QueryOutcome;
  waitMs: number;
  execMs: number;
}): void {
  const labels = {
    connector_type: o.connectorType,
    priority: String(o.priority),
    outcome: o.outcome,
  };
  m().queryDuration.observe(labels, o.execMs / 1000);
  m().queueWait.observe(labels, o.waitMs / 1000);
}

export function recordRejection(
  connectorType: string,
  reason: RejectionReason,
): void {
  m().rejections.inc({ connector_type: connectorType, reason });
}

/**
 * A wait that ended in the queue timeout is still a wait: it goes into the
 * wait histogram too, or its p95 would hide saturation. A rejection never
 * waited, so it is only counted.
 */
export function recordQueueTimeout(
  connectorType: string,
  priority: 1 | 2 | 3,
  waitMs: number,
): void {
  m().queueTimeouts.inc({ connector_type: connectorType });
  m().queueWait.observe(
    {
      connector_type: connectorType,
      priority: String(priority),
      outcome: "queue_timeout",
    },
    waitMs / 1000,
  );
}

/** The browser abandoned a read (#2444, #2459). */
export function recordCancellation(connectorType: string): void {
  m().cancellations.inc({ connector_type: connectorType });
}

/** `route` is the logRoute module name, a bounded set, never the raw path. */
export function recordRequest(
  route: string,
  method: string,
  status: number,
  durationMs: number,
): void {
  const labels = { route, method, status: String(status) };
  m().httpRequests.inc(labels);
  m().httpDuration.observe(labels, durationMs / 1000);
}
