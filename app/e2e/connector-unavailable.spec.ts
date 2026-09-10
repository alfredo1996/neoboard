import {
  test,
  expect,
  ALICE,
  TEST_PG_PORT,
  createTestDashboard,
} from "./fixtures";
import type { APIRequestContext, Page } from "@playwright/test";

/**
 * #1678 — a dead connector storms retries and hangs widgets on
 * "Waiting for parameters…".
 *
 * Two connections on one dashboard: one pointing at an unroutable address
 * (packets are dropped, never refused — the case ECONNREFUSED handling never
 * covered), one at the seeded test container. Everything on the dead one
 * must name the connector within the connect timeout, fire at most one
 * request per widget per refresh cycle, and leave the rest of the dashboard
 * — and the editor — usable without a reload. So must a widget on the
 * healthy connection that waits on the dead selector's parameter. Once the
 * connection is repointed, the selector's Retry brings everything back —
 * still without a reload.
 *
 * `widget-states.spec.ts` covers bad *queries*; this covers a bad *host*.
 */

const HEALTHY_PG = "conn-pg-001";
/** Unroutable: the connect hangs until the driver's own timeout fires. */
const DEAD_HOST = "10.255.255.1";
const CONNECT_TIMEOUT_MS = 3_000;
const REFRESH_SECONDS = 5;

const DEAD_SEED = "SELECT 'a' AS value, 'A' AS label";
const DEAD_PLAIN = "SELECT 1 AS n";
/** Gated on the parameter the dead seed query can never provide. */
const DEAD_DEPENDENT = "SELECT $param_pick AS picked";
const HEALTHY = "SELECT 'healthy' AS status";
/** Same gate, but the widget itself is on the healthy connection. */
const HEALTHY_DEPENDENT = "SELECT $param_pick AS picked_elsewhere";

async function createDeadConnection(request: APIRequestContext, stamp: number) {
  const res = await request.post("/api/connections", {
    data: {
      name: `Dead PG ${stamp}`,
      type: "postgresql",
      config: {
        uri: `postgresql://${DEAD_HOST}:5432/movies`,
        username: "nobody",
        password: "nothing",
        connectionTimeout: CONNECT_TIMEOUT_MS,
      },
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data.id as string;
}

async function createDashboard(
  request: APIRequestContext,
  stamp: number,
  deadId: string,
) {
  const { id, cleanup } = await createTestDashboard(
    request,
    `Dead connector ${stamp}`,
  );
  const put = await request.put(`/api/dashboards/${id}`, {
    data: {
      layoutJson: {
        version: 2,
        settings: {
          autoRefresh: true,
          refreshIntervalSeconds: REFRESH_SECONDS,
        },
        pages: [
          {
            id: "p1",
            title: "Main",
            widgets: [
              {
                id: "p-dead",
                chartType: "parameter-select",
                connectionId: deadId,
                query: "",
                settings: {
                  title: "Pick",
                  chartOptions: {
                    parameterType: "select",
                    parameterName: "pick",
                    seedQuery: DEAD_SEED,
                  },
                },
              },
              {
                id: "w-dead",
                chartType: "table",
                connectionId: deadId,
                query: DEAD_PLAIN,
                settings: { title: "Dead plain" },
              },
              {
                id: "w-dep",
                chartType: "table",
                connectionId: deadId,
                query: DEAD_DEPENDENT,
                settings: { title: "Dead dependent" },
              },
              {
                id: "w-ok",
                chartType: "table",
                connectionId: HEALTHY_PG,
                query: HEALTHY,
                settings: { title: "Healthy" },
              },
              {
                id: "w-dep-ok",
                chartType: "table",
                connectionId: HEALTHY_PG,
                query: HEALTHY_DEPENDENT,
                settings: { title: "Healthy but gated" },
              },
            ],
            gridLayout: [
              { i: "p-dead", x: 0, y: 0, w: 4, h: 3 },
              { i: "w-dead", x: 4, y: 0, w: 4, h: 4 },
              { i: "w-dep", x: 8, y: 0, w: 4, h: 4 },
              { i: "w-ok", x: 0, y: 4, w: 6, h: 4 },
              { i: "w-dep-ok", x: 6, y: 4, w: 6, h: 4 },
            ],
          },
        ],
      },
    },
  });
  expect(put.ok(), await put.text()).toBe(true);
  return { id, cleanup };
}

/** Timestamps of every POST /api/query, keyed by the query text. */
function recordQueryRequests(page: Page) {
  const hits = new Map<string, number[]>();
  page.on("request", (req) => {
    if (req.method() !== "POST" || !req.url().includes("/api/query")) return;
    let key = "?";
    try {
      key = (req.postDataJSON() as { query?: string })?.query ?? "?";
    } catch {
      // not JSON — leave it under "?"
    }
    hits.set(key, [...(hits.get(key) ?? []), Date.now()]);
  });
  return (query: string, since = 0) =>
    (hits.get(query) ?? []).filter((t) => t >= since).length;
}

test.describe("Dead connector (#1678)", () => {
  test("names the connector, fires once per cycle, and leaves the dashboard usable", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(120_000);
    await authPage.login(ALICE.email, ALICE.password);

    const stamp = Date.now();
    const deadId = await createDeadConnection(page.request, stamp);
    const { id, cleanup } = await createDashboard(page.request, stamp, deadId);
    const requestsFor = recordQueryRequests(page);

    try {
      await page.goto(`/${id}`);

      // The healthy connection is unaffected.
      await expect(page.getByText("healthy", { exact: true })).toBeVisible({
        timeout: 15_000,
      });

      // Every widget waiting on the dead connection names the connector
      // within the connect timeout: the plain widget from its own 502, the
      // parameter widget from its seed query, and both dependent widgets —
      // one on the dead connection, one on the healthy one — from the status
      // the other two wrote; neither ever ran. Before the fix the plain
      // widget sat on a skeleton through three retries (~4× the timeout)
      // and the dependent ones said "Waiting for parameters…" forever.
      const unavailable = page.getByText("Connector unavailable");
      await expect(unavailable).toHaveCount(4, {
        timeout: CONNECT_TIMEOUT_MS + 5_000,
      });
      await expect(page.getByText(/Waiting for parameters/)).toHaveCount(0);
      await expect(page.getByText("Server timed out")).toHaveCount(0);
      const settledAt = Date.now();

      // Retry budget — at most one request per widget per refresh cycle,
      // measured over two cycles plus one connect timeout so the last
      // in-flight attempt is counted rather than cut off.
      const windowMs = 2 * REFRESH_SECONDS * 1000 + CONNECT_TIMEOUT_MS;
      await page.waitForTimeout(windowMs);
      const allowed = Math.floor(windowMs / (REFRESH_SECONDS * 1000)) + 1;
      expect(requestsFor(DEAD_PLAIN, settledAt)).toBeLessThanOrEqual(allowed);
      expect(requestsFor(HEALTHY, settledAt)).toBeLessThanOrEqual(allowed);
      // The seed query has no interval and no retry: exactly one, ever.
      expect(requestsFor(DEAD_SEED)).toBe(1);
      // Gated on a parameter that never arrived: never ran.
      expect(requestsFor(DEAD_DEPENDENT)).toBe(0);
      expect(requestsFor(HEALTHY_DEPENDENT)).toBe(0);

      // Still interactive, no reload: edit mode and the widget editor open.
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await page.waitForURL(/\/edit/, { timeout: 15_000 });
      await expect(
        page.getByRole("heading", { name: /^Editing:/ }),
      ).toBeVisible();
      await expect(unavailable.first()).toBeVisible();
      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const addWidget = page.getByRole("dialog", { name: "Add Widget" });
      await expect(addWidget).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(addWidget).toBeHidden();

      // Recovery, still without a reload: repoint the connection at the
      // healthy host and use the selector's Retry — the seed query has no
      // interval and nothing else invalidates it. The gated widgets follow
      // the store back to "waiting", and the plain widget's next refresh
      // cycle clears its own card.
      const repoint = await page.request.patch(`/api/connections/${deadId}`, {
        data: {
          config: {
            uri: `postgresql://localhost:${TEST_PG_PORT}`,
            username: "neoboard",
            password: "neoboard",
            database: "movies",
          },
        },
      });
      expect(repoint.ok(), await repoint.text()).toBe(true);
      await page
        .locator('[data-widget-id="p-dead"]')
        .getByRole("button", { name: "Retry" })
        .click();
      await expect(page.getByText("Select a value…")).toBeVisible({
        timeout: 15_000,
      });
      await expect(unavailable).toHaveCount(0, {
        timeout: REFRESH_SECONDS * 1000 + 15_000,
      });
      expect(requestsFor(DEAD_SEED)).toBe(2);
    } finally {
      await cleanup();
      await page.request.delete(`/api/connections/${deadId}`);
    }
  });
});
