# Performance Testing

NeoBoard has two complementary performance testing layers:

1. **Playwright E2E performance specs** — browser-level, measures tab-switch latency and large-dashboard render time
2. **k6 stress tests** — API-level, measures throughput, latency percentiles, and error rates under concurrent load

---

## Quick Start (fully automated)

```bash
# From repo root — starts Docker, dev server, seeds user, runs all 6 suites, cleans up
./stress/run-all.sh
```

Results are written to `stress/results/<timestamp>/` — one `.json`, `.txt`, and `.log` per suite.

**Prerequisites:**
- Docker Desktop running
- `k6` installed: `brew install k6`
- `npm` available

The script handles everything else: database containers, the Next.js dev server, a dedicated stress-test user, and temporary database connections.

---

## Playwright Performance Specs

Located in `app/e2e/performance.spec.ts`. Run with the rest of the E2E suite:

```bash
# All E2E tests (requires Docker)
cd app && npm run test:e2e

# Just performance tests
cd app && npx playwright test performance --reporter=list
```

### What is measured

| Test | What it times | Threshold |
|------|--------------|-----------|
| Tab switch | Click → all widget skeletons gone | < 3 000 ms per tab |
| Large dashboard (25 widgets) | Page load → all widgets settled | < 15 000 ms total |
| Concurrent connectors (60 widgets) | API mount → 30 Neo4j + 30 PG widgets settled | < 30 000 ms total |

Timings are printed to the test output (`console.log`); they are not stored as artefacts.

### How the loading gate works

Widget cards set `data-loading="true"` while fetching. The tests wait for:

```ts
await page.waitForFunction(() =>
  document.querySelectorAll('[data-loading="true"]').length === 0,
  { timeout }
);
```

This ensures the measured time includes actual query round-trips, not just DOM paint.

---

## k6 Stress Test Suites

All scripts live in `stress/scripts/`. Each accepts environment variables via `-e KEY=value`.

### Suite reference

| Suite | Script | Peak VUs | Duration | Endpoint |
|-------|--------|----------|----------|----------|
| `dashboard-list` | `dashboard-list.js` | 50 | 50 s | `GET /api/dashboards` |
| `query-exec-neo4j` | `query-exec.js` | 10 | 80 s | `POST /api/query` (Cypher) |
| `query-exec-pg` | `query-exec.js` | 10 | 80 s | `POST /api/query` (SQL) |
| `large-dashboard` | `large-dashboard.js` | 10 | 80 s | `GET /api/dashboards/:id` |
| `large-dashboard-queries` | `large-dashboard-queries.js` | 10 | 80 s | `POST /api/query` (100-widget batch) |
| `concurrent-queries` | `concurrent-queries.js` | 50+50 | 60 s | `POST /api/query` (both connectors) |

### Thresholds

| Metric | Threshold | Notes |
|--------|-----------|-------|
| `http_req_duration` p95 | < 500 ms (dashboards), < 2 000 ms (queries) | Per-suite overrides apply |
| `http_req_failed` | < 1% | Covers non-2xx responses |
| `neo4j_query_duration_ms` p95 | < 3 000 ms | Bolt protocol overhead |
| `neo4j_query_duration_ms` p99 | < 5 000 ms | |
| `pg_query_duration_ms` p95 | < 3 000 ms | Under 100 concurrent VUs on dev |
| `pg_query_duration_ms` p99 | < 5 000 ms | |
| `neo4j_error_rate` | < 1% | |
| `pg_error_rate` | < 1% | |

A suite exits with a non-zero code if any threshold is breached — the `run-all.sh` script reports which suites failed.

### Running a single suite manually

You need a session cookie first. The easiest way is to run `run-all.sh` once and copy the `SESSION_COOKIE` value it prints, or use the cookie jar approach below.

```bash
# 1. Start the app
cd app && npm run dev &

# 2. Acquire CSRF token + login cookie (Auth.js v5 requires two steps)
COOKIE_JAR=$(mktemp /tmp/k6-cookies.XXXXXX)
CSRF_TOKEN=$(curl -s -c "$COOKIE_JAR" http://localhost:3000/api/auth/csrf \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")

curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  -X POST http://localhost:3000/api/auth/callback/credentials \
  -d "email=alice@example.com&password=password123&csrfToken=${CSRF_TOKEN}" \
  -L -o /dev/null

SESSION_COOKIE=$(grep 'authjs.session-token\|next-auth.session-token' "$COOKIE_JAR" \
  | awk '{print $6"="$7}' | head -1)

# 3. Run a suite
k6 run \
  -e SESSION_COOKIE="$SESSION_COOKIE" \
  -e BASE_URL="http://localhost:3000" \
  stress/scripts/dashboard-list.js
```

### Running with a specific connection

`query-exec.js` and `concurrent-queries.js` require a connection ID:

```bash
k6 run \
  -e SESSION_COOKIE="$SESSION_COOKIE" \
  -e CONNECTION_ID="<uuid-from-connections-page>" \
  -e QUERY="RETURN 1 AS value" \
  stress/scripts/query-exec.js
```

For the concurrent-queries suite:

```bash
k6 run \
  -e SESSION_COOKIE="$SESSION_COOKIE" \
  -e NEO4J_CONN_ID="<neo4j-uuid>" \
  -e PG_CONN_ID="<postgres-uuid>" \
  stress/scripts/concurrent-queries.js
```

---

## Reading k6 Output

After a run the terminal shows a summary table. The most important rows:

```text
http_req_duration ..... avg=142ms  p(90)=280ms  p(95)=340ms  p(99)=680ms
http_req_failed ....... 0.00%
checks ................ 100.00%
```

Per-connector metrics appear when running `concurrent-queries.js`:

```text
neo4j_query_duration_ms .. p(95)=1.2s   p(99)=2.8s
pg_query_duration_ms ..... p(95)=0.9s   p(99)=1.6s
neo4j_error_rate ......... 0.00%
pg_error_rate ............ 0.00%
```

The JSON output at `stress/results/<timestamp>/<suite>.json` contains the full metric set and can be imported into Grafana or processed with `jq`.

```bash
# Example: extract p95 from a saved result
jq '.metrics.http_req_duration.values["p(95)"]' \
  stress/results/20260223_233732/dashboard-list.json
```

---

## Results Directory Layout

```text
stress/results/
└── 20260223_233732/         # timestamp = run start
    ├── dashboard-list.json           # k6 JSON output
    ├── dashboard-list-summary.txt    # k6 text summary
    ├── dashboard-list.log            # full stdout (includes k6 progress)
    ├── query-exec-neo4j.*
    ├── query-exec-pg.*
    ├── large-dashboard.*
    ├── large-dashboard-queries.*
    ├── concurrent-queries.*
    └── dev-server.log                # Next.js dev server stdout
```

Results are never auto-deleted. Archive or delete `stress/results/` manually as needed.

---

## Standards Coverage and Known Gaps

### What is covered

| Standard | Covered |
|----------|---------|
| RAIL — Response (< 100 ms for user interactions) | Partially — tab switch measured |
| RAIL — Load (< 1 s meaningful content) | Partially — large-dashboard threshold is 15 s (dev machine) |
| k6 p95 latency per endpoint | Yes — all 6 suites |
| k6 p99 latency for query endpoints | Yes — concurrent-queries suite |
| Error rate < 1% under load | Yes — all suites |
| Connector fairness (Neo4j vs PG throughput) | Yes — concurrent-queries |
| Connection pool saturation under 100 VUs | Yes — concurrent-queries |

### Known gaps

| Gap | Impact | Mitigation |
|-----|--------|------------|
| No LCP (Largest Contentful Paint) measurement | Can't validate Core Web Vitals pass | Use Lighthouse CLI or PageSpeed Insights against a staging deployment |
| No CLS (Cumulative Layout Shift) | Layout stability unknown | Playwright has no built-in CLS check; use Lighthouse |
| No INP (Interaction to Next Paint) | Replaced FID in 2024; not measured | Hard to measure in headless Playwright; use Chrome DevTools on real hardware |
| p99 thresholds only on concurrent-queries | Single-endpoint p99 regressions can go undetected | Add `"p(99)<N"` to `dashboard-list.js` and `query-exec.js` thresholds if needed |
| Error rate threshold is 1% | For production SLAs 0.1% or 0.01% is typical | Tighten thresholds when running against staging/production |
| No baseline comparison | Can't detect regressions automatically | Store results in version control or compare JSON outputs between runs with `jq` |
| Thresholds tuned for local dev | Will pass on slow hardware even with regressions | Use a dedicated CI runner or staging instance for meaningful comparisons |

---

## Adding a New Suite

1. Create `stress/scripts/my-scenario.js` following the pattern of an existing script.
2. Add an entry to the `SUITES` array in `stress/run-all.sh`:
   ```bash
   "my-scenario|scripts/my-scenario.js|EXTRA_VAR=value"
   ```
3. The runner will pick it up automatically on the next execution.
