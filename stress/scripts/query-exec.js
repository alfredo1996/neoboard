/**
 * k6 stress test — Query execution endpoint
 *
 * This is the heaviest endpoint — it hits Neo4j or PostgreSQL for every request.
 * Use fewer VUs and a longer duration to observe connection pool behaviour.
 *
 * Usage:
 *   k6 run -e SESSION_COOKIE="next-auth.session-token=<value>" \
 *          -e BASE_URL="http://localhost:3000" \
 *          -e CONNECTION_ID="<uuid-of-a-seeded-connection>" \
 *          stress/scripts/query-exec.js
 *
 * The CONNECTION_ID must belong to a connection the session user can access.
 * For local dev, grab it from the DB or the Connections page in the UI.
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
    // Query endpoint is heavier — allow up to 2 s at p95
    http_req_duration: ["p(95)<2000"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const COOKIE = __ENV.SESSION_COOKIE;
const CONNECTION_ID = __ENV.CONNECTION_ID;
// Pass QUERY env var to override the default (e.g. SQL for PG, Cypher for Neo4j)
const QUERY = __ENV.QUERY || "RETURN 1 AS value";

if (!COOKIE) {
  throw new Error("SESSION_COOKIE env var is required (-e SESSION_COOKIE=<value>)");
}
if (!CONNECTION_ID) {
  throw new Error("CONNECTION_ID env var is required (-e CONNECTION_ID=<uuid>)");
}

const PAYLOAD = JSON.stringify({
  connectionId: CONNECTION_ID,
  query: QUERY,
  params: {},
});

export default function () {
  const res = http.post(`${BASE}/api/query`, PAYLOAD, {
    headers: {
      Cookie: COOKIE,
      "Content-Type": "application/json",
    },
  });

  check(res, {
    "status 200": (r) => r.status === 200,
    "has rows": (r) => {
      try {
        const body = JSON.parse(r.body);
        // Neo4j returns data as an array; PostgreSQL wraps it in {records, summary}
        return Array.isArray(body.data) || Array.isArray(body.data?.records);
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
