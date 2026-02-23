/**
 * k6 stress test — Concurrent query burst (large dashboard backend impact)
 *
 * Simulates what the backend experiences when a user opens a 100-widget
 * dashboard: all widget queries fire simultaneously, saturating the
 * connection pool and query queue.
 *
 * This test measures:
 *   - p95 / p99 query latency under burst load
 *   - Error rate (circuit-breaker / queue overflow behaviour)
 *   - Throughput degradation as VU count rises
 *
 * Usage:
 *   k6 run -e SESSION_COOKIE="next-auth.session-token=<value>" \
 *          -e BASE_URL="http://localhost:3000" \
 *          -e CONNECTION_ID="conn-neo4j-001" \
 *          stress/scripts/large-dashboard-queries.js
 *
 * Scenarios:
 *   burst    — 100 VUs all fire at the same time (single-user 100-widget open)
 *   ramp     — gradual ramp to 50 VUs (multi-user concurrent load)
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// Custom metrics for finer-grained reporting
const queryErrorRate = new Rate("query_error_rate");
const queryDuration = new Trend("query_duration_ms", true);

export const options = {
  scenarios: {
    // Scenario 1: single user opens a 100-widget dashboard (all queries burst at once)
    burst: {
      executor: "per-vu-iterations",
      vus: 100,
      iterations: 1,
      maxDuration: "60s",
      startTime: "0s",
      tags: { scenario: "burst" },
    },
    // Scenario 2: gradual ramp simulating multiple concurrent users
    ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 10 },
        { duration: "40s", target: 50 },
        { duration: "10s", target: 0 },
      ],
      startTime: "70s", // run after burst scenario
      tags: { scenario: "ramp" },
    },
  },
  thresholds: {
    // Query endpoint under burst: allow up to 5 s at p95 (100 concurrent queries)
    "http_req_duration{scenario:burst}": ["p(95)<5000"],
    // Query endpoint under ramp: tighter, 2 s at p95
    "http_req_duration{scenario:ramp}": ["p(95)<2000"],
    // Error rate stays below 1% in both scenarios
    http_req_failed: ["rate<0.01"],
    query_error_rate: ["rate<0.01"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const COOKIE = __ENV.SESSION_COOKIE;
const CONNECTION_ID = __ENV.CONNECTION_ID || "conn-neo4j-001";

const authHeaders = {
  Cookie: COOKIE,
  "Content-Type": "application/json",
};

// Lightweight read query — same as what a single-value widget fires
const QUERY_PAYLOAD = JSON.stringify({
  connectionId: CONNECTION_ID,
  query: "RETURN 1 AS value",
  params: {},
});

export default function () {
  group("widget query", () => {
    const start = Date.now();

    const res = http.post(`${BASE}/api/query`, QUERY_PAYLOAD, {
      headers: authHeaders,
      tags: { name: "widget_query" },
    });

    const duration = Date.now() - start;
    queryDuration.add(duration);

    const ok = check(res, {
      "status 200": (r) => r.status === 200,
      "has data array": (r) => {
        try {
          const body = JSON.parse(r.body);
          // Neo4j returns data as an array; PostgreSQL wraps it in {records, summary}
          return Array.isArray(body.data) || Array.isArray(body.data?.records);
        } catch {
          return false;
        }
      },
    });

    queryErrorRate.add(!ok);
  });

  // No sleep in burst scenario — immediate fire simulates browser widget init
  sleep(0.1);
}
