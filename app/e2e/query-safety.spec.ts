import { test, expect, ALICE, createTestDashboard } from "./fixtures";
import type { APIRequestContext } from "@playwright/test";

/**
 * Covers issue #480 — query safety nets (timeout + row cap + error UX).
 *
 * Seven tests, split by verification strategy:
 *
 *   1. PG query timeout        — API-only (page.request.post)
 *   2. Cypher query timeout    — API-only (needs APOC, enabled in global-setup)
 *   3. PG row cap              — UI + API (banner + meta.truncated)
 *   4. Cypher row cap          — UI + API
 *   5. Empty result "No data"  — UI (EmptyState)
 *   6. SQL syntax error        — API-only
 *   7. Cypher syntax error     — API-only
 *
 * Findings that shape these tests (documented in the PR body):
 *
 * 1. Default query timeout is 30s (#973 — it was 2s for years). The
 *    timeout tests create their own connections with explicit short
 *    timeouts, which doubles as end-to-end proof that UI-configured
 *    statementTimeout/queryTimeout actually reach the driver.
 *
 * 2. Row cap is 5000 by default, user-configurable per connection via
 *    `credentials.maxRows` (#499 fix). The driver signals truncation by
 *    calling `setStatus(COMPLETE_TRUNCATED)`, which the query-executor
 *    captures into `truncated: true` on its return value. The API route
 *    forwards both `truncated` and the effective `rowLimit` into meta,
 *    and the UI banner renders "Showing first N rows" with the dynamic
 *    value. Test 3 verifies the default, test 4b verifies a per-connection
 *    override is honored.
 *
 * 3. The empty-state card header reads "No data": since #1584 the host stops a
 *    zero-row result before the plugin, so DataGrid's own "No results" is no
 *    longer reachable from a dashboard.
 *
 * 4. APOC is required for the Cypher timeout test. global-setup.ts
 *    enables NEO4J_PLUGINS=["apoc"] so `apoc.util.sleep` is available.
 */

const PG_CONNECTION_ID = "conn-pg-001";
const NEO4J_CONNECTION_ID = "conn-neo4j-001";

/** Helper: create a dashboard with a single table widget that runs `query`. */
async function createSingleTableDashboard(
  request: APIRequestContext,
  name: string,
  connectionId: string,
  query: string,
) {
  const { id, cleanup } = await createTestDashboard(request, name);
  const putRes = await request.put(`/api/dashboards/${id}`, {
    data: {
      layoutJson: {
        version: 2 as const,
        pages: [
          {
            id: "page-1",
            title: "Main",
            widgets: [
              {
                id: "w1",
                chartType: "table",
                connectionId,
                query,
                settings: { title: name },
              },
            ],
            gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 8 }],
          },
        ],
      },
    },
  });
  if (!putRes.ok()) {
    throw new Error(`PUT dashboard failed: ${putRes.status()}`);
  }
  return { id, cleanup };
}

test.describe("Query safety nets — timeout + row cap + error UX", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. PostgreSQL query timeout
  // ─────────────────────────────────────────────────────────────────────────
  test("PG query exceeding the timeout returns a user-facing error", async ({
    page,
  }) => {
    // Dedicated connection with a 2s pg-specific statementTimeout — the
    // package default is 30s (#973), and this also proves the UI-exposed
    // statementTimeout option reaches the driver end-to-end.
    const createRes = await page.request.post("/api/connections", {
      data: {
        name: `e2e-pg-timeout-${Date.now()}`,
        type: "postgresql",
        config: {
          uri: `postgresql://localhost:${process.env.TEST_PG_PORT ?? "5432"}`,
          username: "neoboard",
          password: "neoboard",
          database: "movies",
          statementTimeout: 2000,
        },
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const shortTimeoutConnId = (await createRes.json()).data.id as string;

    const t0 = Date.now();
    const res = await page.request.post("/api/query", {
      data: {
        connectionId: shortTimeoutConnId,
        // pg_sleep(3) far exceeds the 2s statement timeout configured above.
        query: "SELECT pg_sleep(3)",
      },
    });
    const elapsed = Date.now() - t0;

    await page.request.delete(`/api/connections/${shortTimeoutConnId}`);

    // The driver/route must fail fast, not hang the full 3s. Allow some
    // overhead for round-trip + error handling — 5s is a generous ceiling.
    expect(elapsed).toBeLessThan(5_000);
    // Driver-level statement timeout is classified as transient by the
    // route handler, which returns 408 + Retry-After so clients can back
    // off. See app/src/lib/query/transient-error-classifier.ts.
    expect(res.status()).toBe(408);
    expect(res.headers()["retry-after"]).toBe("3");

    const body = await res.json();
    expect(body.error?.message).toBeTruthy();
    // The message should be a human string, not a stack trace.
    expect(body.error?.message).not.toMatch(/\s+at\s.+:\d+:\d+/);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Cypher query timeout
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Important: `apoc.util.sleep` is NOT a reliable way to trigger a Neo4j
  // transaction timeout. It's a pure Java Thread.sleep that runs inside
  // the transaction but never yields back to the driver's guard points,
  // so the 2s timeout can't interrupt it — the sleep completes, the
  // transaction commits, and the request returns 200. Observed as flakiness
  // in the first iteration of this spec.
  //
  // Instead, we use a compute-heavy query that hits guard points between
  // iterations. Neo4j's managed transaction timeout is checked between
  // each operator fetch, so a long UNWIND pipeline with work inside each
  // iteration gets aborted cleanly.
  test("Cypher query exceeding the timeout returns a user-facing error", async ({
    page,
  }) => {
    // Dedicated connection with a 2s generic queryTimeout (#973 — default
    // is 30s); proves the queryTimeout option reaches Neo4j's tx timeout.
    const createRes = await page.request.post("/api/connections", {
      data: {
        name: `e2e-neo4j-timeout-${Date.now()}`,
        type: "neo4j",
        config: {
          uri: process.env.TEST_NEO4J_BOLT_URL ?? "bolt://localhost:7687",
          username: "neo4j",
          password: "neoboard123",
          queryTimeout: 2000,
        },
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const shortTimeoutConnId = (await createRes.json()).data.id as string;

    const t0 = Date.now();
    const res = await page.request.post("/api/query", {
      data: {
        connectionId: shortTimeoutConnId,
        query:
          "UNWIND range(1, 5000000) AS x " +
          "UNWIND range(1, 1000) AS y " +
          "RETURN count(x + y) AS c",
      },
    });
    const elapsed = Date.now() - t0;

    await page.request.delete(`/api/connections/${shortTimeoutConnId}`);

    // Cypher's cancel cycle plus APOC plugin overhead is slower than PG —
    // allow up to 10s for the driver to abort and the route to respond.
    expect(elapsed).toBeLessThan(10_000);
    // Neo4j transaction timeout is classified as transient and returns
    // 408 + Retry-After (same path as PG statement timeout above).
    expect(res.status()).toBe(408);
    expect(res.headers()["retry-after"]).toBe("3");

    const body = await res.json();
    expect(body.error?.message).toBeTruthy();
    expect(body.error?.message).not.toMatch(/\s+at\s.+:\d+:\d+/);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. PostgreSQL row cap — driver signal reaches meta.truncated + banner
  // ─────────────────────────────────────────────────────────────────────────
  //
  // After #499, the PG connector's COMPLETE_TRUNCATED status flows through
  // the query-executor's setStatus handler into the API response, so both
  // meta.truncated and meta.rowLimit are populated and the widget renders
  // the "Showing first N rows" banner.
  test("PG row cap propagates driver truncation signal to API and widget banner", async ({
    page,
  }) => {
    // API-level assertion first — seeded conn-pg-001 has no maxRows
    // override, so the effective cap is DEFAULT_MAX_ROWS (5000).
    const apiRes = await page.request.post("/api/query", {
      data: {
        connectionId: PG_CONNECTION_ID,
        query: "SELECT generate_series(1, 15000) AS id",
      },
    });
    expect(apiRes.status()).toBe(200);
    const body = await apiRes.json();

    expect(Array.isArray(body.data?.data)).toBe(true);
    expect((body.data?.data as unknown[]).length).toBe(5_000);
    expect(body.meta?.truncated).toBe(true);
    expect(body.meta?.rowLimit).toBe(5000);

    // UI-level assertion: create a dashboard that runs the same query
    // and verify the banner renders with the correct dynamic text.
    const { id, cleanup } = await createSingleTableDashboard(
      page.request,
      `pg-row-cap ${Date.now()}`,
      PG_CONNECTION_ID,
      "SELECT generate_series(1, 15000) AS id",
    );
    try {
      await page.goto(`/${id}`);
      await expect(
        page.getByText(
          /Showing first 5,000 rows\. Refine your query to see all results\./,
        ),
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      await cleanup();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Cypher row cap — same behavior via Neo4j driver signal
  // ─────────────────────────────────────────────────────────────────────────
  test("Cypher row cap propagates driver truncation signal to API and widget banner", async ({
    page,
  }) => {
    const apiRes = await page.request.post("/api/query", {
      data: {
        connectionId: NEO4J_CONNECTION_ID,
        query: "UNWIND range(1, 15000) AS x RETURN x AS id",
      },
    });
    expect(apiRes.status()).toBe(200);
    const body = await apiRes.json();

    expect(Array.isArray(body.data?.data)).toBe(true);
    expect((body.data?.data as unknown[]).length).toBe(5_000);
    expect(body.meta?.truncated).toBe(true);
    expect(body.meta?.rowLimit).toBe(5000);

    const { id, cleanup } = await createSingleTableDashboard(
      page.request,
      `cypher-row-cap ${Date.now()}`,
      NEO4J_CONNECTION_ID,
      "UNWIND range(1, 15000) AS x RETURN x AS id",
    );
    try {
      await page.goto(`/${id}`);
      await expect(
        page.getByText(
          /Showing first 5,000 rows\. Refine your query to see all results\./,
        ),
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      await cleanup();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4b. Per-connection maxRows override
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Creators can raise (or lower) the cap on a per-connection basis via
  // Advanced Settings > Max Rows per Query. This test creates a PG
  // connection with maxRows=1000 and verifies the driver honors it — both
  // the row count and the banner should reflect the custom value.
  test("per-connection maxRows override is honored by driver + banner", async ({
    page,
  }) => {
    // Create a fresh PG connection with an explicit maxRows cap.
    const createRes = await page.request.post("/api/connections", {
      data: {
        name: `maxrows-override ${Date.now()}`,
        type: "postgresql",
        config: {
          uri: `postgresql://localhost:${process.env.TEST_PG_PORT ?? "5432"}`,
          username: "neoboard",
          password: "neoboard",
          database: "movies",
          maxRows: 1000,
        },
      },
    });
    expect(createRes.status()).toBe(201);
    const connId = (await createRes.json()).data.id as string;

    try {
      // API-level: effective cap should be 1000, not the 5000 default.
      const apiRes = await page.request.post("/api/query", {
        data: {
          connectionId: connId,
          query: "SELECT generate_series(1, 5000) AS id",
        },
      });
      expect(apiRes.status()).toBe(200);
      const body = await apiRes.json();
      expect((body.data?.data as unknown[]).length).toBe(1_000);
      expect(body.meta?.truncated).toBe(true);
      expect(body.meta?.rowLimit).toBe(1000);

      // UI-level: banner should render with the override value.
      const { id, cleanup } = await createSingleTableDashboard(
        page.request,
        `pg-override ${Date.now()}`,
        connId,
        "SELECT generate_series(1, 5000) AS id",
      );
      try {
        await page.goto(`/${id}`);
        await expect(page.getByText(/Showing first 1,000 rows\./)).toBeVisible({
          timeout: 20_000,
        });
      } finally {
        await cleanup();
      }
    } finally {
      await page.request.delete(`/api/connections/${connId}`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Empty result set shows "No data" empty state
  // ─────────────────────────────────────────────────────────────────────────
  test("empty result set renders the No data empty state, not an error", async ({
    page,
  }) => {
    const { id, cleanup } = await createSingleTableDashboard(
      page.request,
      `empty-result ${Date.now()}`,
      NEO4J_CONNECTION_ID,
      // A label that provably does not exist in the seeded movies DB.
      "MATCH (n:ThisLabelDoesNotExist) RETURN n",
    );

    try {
      await page.goto(`/${id}`);
      // One host-level empty state for every query-backed widget (#1584).
      await expect(page.getByText("No data", { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        page.getByText("No results", { exact: true }),
      ).not.toBeVisible();
      // Critically: the widget must not show an error state.
      await expect(page.getByText(/query.*failed/i)).not.toBeVisible();
    } finally {
      await cleanup();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. SQL syntax error → 500 + user-facing message
  // ─────────────────────────────────────────────────────────────────────────
  test("SQL syntax error returns a user-facing message, not a stack trace", async ({
    page,
  }) => {
    const res = await page.request.post("/api/query", {
      data: {
        connectionId: PG_CONNECTION_ID,
        query: "SELEKT * FROM movies",
      },
    });
    expect(res.status()).toBe(500);

    const body = await res.json();
    expect(body.error?.message).toBeTruthy();
    expect(body.error?.message).not.toMatch(/\s+at\s.+:\d+:\d+/);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Cypher syntax error → 500 + user-facing message
  // ─────────────────────────────────────────────────────────────────────────
  test("Cypher syntax error returns a user-facing message, not a stack trace", async ({
    page,
  }) => {
    const res = await page.request.post("/api/query", {
      data: {
        connectionId: NEO4J_CONNECTION_ID,
        query: "MATCH MATCH MATCH",
      },
    });
    expect(res.status()).toBe(500);

    const body = await res.json();
    expect(body.error?.message).toBeTruthy();
    expect(body.error?.message).not.toMatch(/\s+at\s.+:\d+:\d+/);
  });
});
