/**
 * k6 stress test — Dashboard list endpoint
 *
 * Usage:
 *   k6 run -e SESSION_COOKIE="next-auth.session-token=<value>" \
 *          -e BASE_URL="http://localhost:3000" \
 *          stress/scripts/dashboard-list.js
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
    { duration: "10s", target: 20 }, // ramp up
    { duration: "30s", target: 50 }, // peak load
    { duration: "10s", target: 0 },  // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const COOKIE = __ENV.SESSION_COOKIE;

export default function () {
  const res = http.get(`${BASE}/api/dashboards`, {
    headers: {
      Cookie: COOKIE,
      "Content-Type": "application/json",
    },
  });

  check(res, {
    "status 200": (r) => r.status === 200,
    "response has data": (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body);
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
