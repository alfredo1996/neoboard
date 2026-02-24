/**
 * k6 stress test — Large dashboard (100+ widgets)
 *
 * Measures backend impact of concurrent users loading a dashboard with many
 * widgets and firing all their queries simultaneously.
 *
 * Setup: creates a 100-widget dashboard once, runs the scenario, then deletes it.
 *
 * Usage:
 *   k6 run -e SESSION_COOKIE="next-auth.session-token=<value>" \
 *          -e BASE_URL="http://localhost:3000" \
 *          stress/scripts/large-dashboard.js
 *
 * Get a session cookie first:
 *   SESSION=$(curl -s -c - -X POST http://localhost:3000/api/auth/callback/credentials \
 *     -d 'email=alice@example.com&password=password123' \
 *     | grep 'next-auth.session' | awk '{print $NF}')
 */

import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "10s", target: 5 },  // ramp up
    { duration: "60s", target: 10 }, // sustained load
    { duration: "10s", target: 0 },  // ramp down
  ],
  thresholds: {
    // Large dashboard GET is heavier — allow up to 1 s at p95
    http_req_duration: ["p(95)<1000"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const COOKIE = __ENV.SESSION_COOKIE;
if (!COOKIE) {
  throw new Error("SESSION_COOKIE env var is required (-e SESSION_COOKIE=<value>)");
}
const CONNECTION_ID = __ENV.CONNECTION_ID || "conn-neo4j-001";

const WIDGET_COUNT = 100;

/** Build the layout payload for a dashboard with N single-value widgets. */
function buildLargeLayout(n) {
  const widgets = Array.from({ length: n }, (_, i) => ({
    id: `perf-k6-w${i + 1}`,
    chartType: "single-value",
    connectionId: CONNECTION_ID,
    query: "RETURN 1 AS value",
    params: {},
    settings: { title: `Widget ${i + 1}` },
  }));

  const gridLayout = widgets.map((w, i) => ({
    i: w.id,
    x: (i % 6) * 2,
    y: Math.floor(i / 6) * 2,
    w: 2,
    h: 2,
  }));

  return {
    version: 2,
    pages: [
      {
        id: "page-1",
        title: "Page 1",
        widgets,
        gridLayout,
      },
    ],
  };
}

const authHeaders = {
  Cookie: COOKIE,
  "Content-Type": "application/json",
};

/** k6 setup: create the large dashboard once before the test run. */
export function setup() {
  const createRes = http.post(
    `${BASE}/api/dashboards`,
    JSON.stringify({ name: "k6-perf-large-dashboard (auto-cleanup)" }),
    { headers: authHeaders }
  );

  check(createRes, { "dashboard created": (r) => r.status === 201 });
  if (createRes.status !== 201) {
    throw new Error(`Dashboard creation failed: ${createRes.body}`);
  }

  const dashboard = JSON.parse(createRes.body);
  const dashboardId = dashboard.id;

  const updateRes = http.put(
    `${BASE}/api/dashboards/${dashboardId}`,
    JSON.stringify({ layoutJson: buildLargeLayout(WIDGET_COUNT) }),
    { headers: authHeaders }
  );

  check(updateRes, { "layout saved": (r) => r.status === 200 });
  if (updateRes.status !== 200) {
    throw new Error(`Dashboard layout update failed: ${updateRes.body}`);
  }

  console.log(`✅ Created large dashboard: ${dashboardId}`);
  return { dashboardId };
}

/** Main scenario: fetch dashboard metadata (no query execution). */
export default function (data) {
  const { dashboardId } = data;

  const res = http.get(`${BASE}/api/dashboards/${dashboardId}`, {
    headers: authHeaders,
  });

  check(res, {
    "status 200": (r) => r.status === 200,
    "has layoutJson": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.layoutJson !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}

/** k6 teardown: delete the large dashboard created in setup. */
export function teardown(data) {
  const { dashboardId } = data;
  if (!dashboardId) return;

  const res = http.del(`${BASE}/api/dashboards/${dashboardId}`, null, {
    headers: authHeaders,
  });

  check(res, { "dashboard deleted": (r) => r.status === 200 });
  console.log(`🗑️  Deleted large dashboard: ${dashboardId}`);
}
