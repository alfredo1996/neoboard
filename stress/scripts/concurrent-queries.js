/**
 * k6 stress test — Concurrent multi-connector query load
 *
 * Fires queries simultaneously against BOTH the Neo4j and PostgreSQL connectors
 * using two parallel VU pools (one per connector).  This surfaces:
 *   - Per-connector p95/p99 latency under concurrent load
 *   - Connector-specific error rates and queue saturation behaviour
 *   - Throughput fairness: does one connector starve the other?
 *
 * Usage:
 *   k6 run \
 *     -e SESSION_COOKIE="next-auth.session-token=<value>" \
 *     -e BASE_URL="http://localhost:3000" \
 *     stress/scripts/concurrent-queries.js
 *
 * Scenarios (run in parallel):
 *   neo4jLoad   — ramp to 50 VUs firing Neo4j queries continuously
 *   postgresLoad — ramp to 50 VUs firing PostgreSQL queries continuously
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ── Per-connector custom metrics ──────────────────────────────────────────────
const neo4jDuration = new Trend("neo4j_query_duration_ms", true);
const pgDuration = new Trend("pg_query_duration_ms", true);
const neo4jErrorRate = new Rate("neo4j_error_rate");
const pgErrorRate = new Rate("pg_error_rate");

// ── Scenario configuration ────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // 50 VUs hitting Neo4j the whole time
    neo4jLoad: {
      executor: "ramping-vus",
      exec: "runNeo4j",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 20 }, // ramp up
        { duration: "40s", target: 50 }, // peak: 50 concurrent Neo4j queries
        { duration: "10s", target: 0 },  // ramp down
      ],
      tags: { connector: "neo4j" },
    },
    // 50 VUs hitting PostgreSQL the whole time — starts together with Neo4j
    postgresLoad: {
      executor: "ramping-vus",
      exec: "runPostgres",
      startVUs: 0,
      stages: [
        { duration: "10s", target: 20 }, // ramp up
        { duration: "40s", target: 50 }, // peak: 50 concurrent PG queries
        { duration: "10s", target: 0 },  // ramp down
      ],
      tags: { connector: "postgresql" },
    },
  },
  thresholds: {
    // Neo4j: p95 < 3 s (Bolt has higher latency than PG for small queries)
    neo4j_query_duration_ms: ["p(95)<3000", "p(99)<5000"],
    // PostgreSQL: p95 < 3 s (local dev machine; matches Neo4j under 100 concurrent VUs)
    pg_query_duration_ms: ["p(95)<3000", "p(99)<5000"],
    // Both connectors: error rate stays below 1%
    neo4j_error_rate: ["rate<0.01"],
    pg_error_rate: ["rate<0.01"],
    // Overall HTTP failure rate
    http_req_failed: ["rate<0.01"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const COOKIE = __ENV.SESSION_COOKIE;
const NEO4J_CONN_ID = __ENV.NEO4J_CONN_ID || "conn-neo4j-001";
const PG_CONN_ID = __ENV.PG_CONN_ID || "conn-pg-001";

const authHeaders = {
  Cookie: COOKIE,
  "Content-Type": "application/json",
};

// ── Varied Neo4j queries (Cypher) ─────────────────────────────────────────────
// Rotate through 4 query shapes so the test isn't purely cache-friendly
const NEO4J_QUERIES = [
  // 1. Trivial — baseline latency
  { query: "RETURN 1 AS value", params: {} },
  // 2. Count all nodes of a label
  { query: "MATCH (m:Movie) RETURN count(m) AS value", params: {} },
  // 3. Aggregation with ORDER BY (light graph traversal)
  {
    query:
      "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN count(*) AS value",
    params: {},
  },
  // 4. Parameterised lookup (exercises parameter handling)
  {
    query: "MATCH (m:Movie {title: $title}) RETURN count(m) AS value",
    params: { title: "The Matrix" },
  },
];

// ── Varied PostgreSQL queries (SQL) ───────────────────────────────────────────
const PG_QUERIES = [
  // 1. Trivial — baseline latency
  { query: "SELECT 1 AS value", params: {} },
  // 2. COUNT on indexed table
  { query: "SELECT COUNT(*) AS value FROM movies", params: {} },
  // 3. Aggregation with GROUP BY
  {
    query:
      "SELECT released, COUNT(*) AS value FROM movies GROUP BY released ORDER BY released DESC LIMIT 5",
    params: {},
  },
  // 4. JOIN (light relational query)
  {
    query:
      "SELECT COUNT(*) AS value FROM roles r JOIN movies m ON r.movie_id = m.id",
    params: {},
  },
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function runQuery(connectionId, queryPool, durationMetric, errorMetric) {
  const { query, params } = pickRandom(queryPool);

  const payload = JSON.stringify({ connectionId, query, params });

  const start = Date.now();
  const res = http.post(`${BASE}/api/query`, payload, {
    headers: authHeaders,
    tags: { name: "widget_query", connectionId },
  });
  const elapsed = Date.now() - start;

  durationMetric.add(elapsed);

  const ok = check(res, {
    "status 200": (r) => r.status === 200,
    "has data": (r) => {
      try {
        const body = JSON.parse(r.body);
        // Neo4j returns data as an array; PostgreSQL wraps it in {records, summary}
        return Array.isArray(body.data) || Array.isArray(body.data?.records);
      } catch {
        return false;
      }
    },
  });

  errorMetric.add(!ok);

  // Minimal pause — simulates a widget polling at ~1 RPS per VU
  sleep(1);
}

// ── Exported scenario functions ───────────────────────────────────────────────

export function runNeo4j() {
  group("neo4j query", () => {
    runQuery(NEO4J_CONN_ID, NEO4J_QUERIES, neo4jDuration, neo4jErrorRate);
  });
}

export function runPostgres() {
  group("postgres query", () => {
    runQuery(PG_CONN_ID, PG_QUERIES, pgDuration, pgErrorRate);
  });
}
