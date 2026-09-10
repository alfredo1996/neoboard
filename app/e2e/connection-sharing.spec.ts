import {
  test,
  expect,
  ALICE,
  TEST_PG_PORT,
  createTestDashboard,
} from "./fixtures";
import { AuthPage } from "./pages/auth";
import type { Browser, Page } from "@playwright/test";

/**
 * Connection visibility model (#901) — "admin provisions, all use".
 *
 * ALICE (admin) owns the connection; a creator with no connections of their
 * own cannot see or query it until ALICE shares it. Sharing makes it
 * queryable and visible tenant-wide, read-only for non-owners; making it
 * private again drops the creator back to the dashboard-bound fallback (#972).
 *
 * Hermetic (#1492): every row the assertions depend on is created here under
 * a unique id — the connection, the creator, and the one dashboard that gives
 * the creator view-level access to it. This spec used to walk the seeded
 * conn-pg-001 as BOB, and those are shared with the whole suite: a concurrent
 * spec that left BOB with edit access to any dashboard on conn-pg-001 (or
 * saved the probe query on a public one) turned the revocation 403 into a
 * legitimate 200. No other file knows these ids, so none can do that here.
 */
test.describe.serial("Connection sharing (#901)", () => {
  const PROBE_QUERY = "SELECT 1 AS ok";
  let connectionId: string;
  let connectionName: string;
  let dashboardId: string;
  let creator: { id: string; email: string; password: string };

  async function asAlice(browser: Browser, fn: (page: Page) => Promise<void>) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await new AuthPage(page).login(ALICE.email, ALICE.password);
      await fn(page);
    } finally {
      await context.close();
    }
  }

  test.beforeAll(async ({ browser }) => {
    // Unique per describe run: repeats and retries must not collide.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    connectionName = `sharing-e2e-${suffix}`;

    await asAlice(browser, async (page) => {
      const email = `sharing-creator-${suffix}@example.com`;
      const password = "password123";
      const userRes = await page.request.post("/api/users", {
        data: { name: `Sharing ${suffix}`, email, password, role: "creator" },
      });
      expect(userRes.status()).toBe(201);
      creator = { id: (await userRes.json()).data.id, email, password };

      const connRes = await page.request.post("/api/connections", {
        data: {
          name: connectionName,
          type: "postgresql",
          config: {
            uri: `postgresql://localhost:${TEST_PG_PORT}`,
            username: "neoboard",
            password: "neoboard",
            database: "movies",
          },
        },
      });
      expect(connRes.status()).toBe(201);
      connectionId = (await connRes.json()).data.id;

      // The creator's only claim on the connection once it is private again:
      // a viewer share, bound to this dashboard's saved query (#972).
      ({ id: dashboardId } = await createTestDashboard(
        page.request,
        connectionName,
      ));
      const layoutRes = await page.request.put(
        `/api/dashboards/${dashboardId}`,
        {
          data: {
            layoutJson: {
              version: 2,
              pages: [
                {
                  id: "p1",
                  title: "Page 1",
                  widgets: [
                    {
                      id: "w1",
                      chartType: "table",
                      connectionId,
                      query: "SELECT count(*) AS n FROM movies",
                    },
                  ],
                  gridLayout: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
                },
              ],
            },
          },
        },
      );
      expect(layoutRes.ok()).toBeTruthy();
      const shareRes = await page.request.post(
        `/api/dashboards/${dashboardId}/share`,
        { data: { email, role: "viewer" } },
      );
      expect(shareRes.ok()).toBeTruthy();
    });
  });

  test.afterAll(async ({ browser }) => {
    await asAlice(browser, async (page) => {
      if (dashboardId)
        await page.request.delete(`/api/dashboards/${dashboardId}`);
      if (connectionId) {
        await page.request.delete(
          `/api/connections/${connectionId}?force=true`,
        );
      }
      if (creator) await page.request.delete(`/api/users/${creator.id}`);
    });
  });

  test("creator does not see another user's private connection", async ({
    authPage,
    page,
  }) => {
    await authPage.login(creator.email, creator.password);
    await page.goto("/connections");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(connectionName)).not.toBeVisible();
  });

  test("admin shares a connection with the workspace", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.goto("/connections");
    // Scope to the single card element (established pattern from
    // connections.spec — bare div filters match every ancestor).
    const card = page
      .locator("div[class*='border']")
      .filter({ hasText: connectionName })
      .filter({
        has: page.getByRole("button", { name: "Connection actions" }),
      });
    await card.getByRole("button", { name: "Connection actions" }).click();
    await page.getByRole("menuitem", { name: "Share with workspace" }).click();
    await expect(card.getByText("Shared", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("creator sees the shared connection read-only and can query it", async ({
    authPage,
    page,
  }) => {
    await authPage.login(creator.email, creator.password);
    await page.goto("/connections");
    await expect(page.getByText(connectionName)).toBeVisible();
    await expect(
      page.getByText("Shared", { exact: true }).first(),
    ).toBeVisible();
    // No management menu at all for non-owners: every action is gated.
    // (The creator owns nothing, so no card on the page has an actions menu.)
    await expect(
      page.getByRole("button", { name: "Connection actions" }),
    ).not.toBeVisible();

    // Direct query through the shared connection — the #901 fast path.
    const res = await page.request.post("/api/query", {
      data: { connectionId, query: PROBE_QUERY },
    });
    expect(res.status()).toBe(200);
  });

  test("creator cannot change visibility (admin-only)", async ({
    authPage,
    page,
  }) => {
    await authPage.login(creator.email, creator.password);
    const res = await page.request.patch(`/api/connections/${connectionId}`, {
      data: { visibility: "private" },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error?.message).toMatch(
      /only admins can change connection visibility/i,
    );
  });

  test("admin makes it private again; creator loses direct access", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const patch = await page.request.patch(`/api/connections/${connectionId}`, {
      data: { visibility: "private" },
    });
    expect(patch.ok()).toBeTruthy();

    await authPage.logout();
    await authPage.login(creator.email, creator.password);
    // Arbitrary direct queries now fall back to dashboard-bound access: the
    // viewer-shared dashboard references this connection, but the probe is
    // not one of its saved queries -> 403 (#972). The message pins the
    // reason: a visibility check that still let the fast path through would
    // answer 200, and a fallback that lost the share would answer 404.
    const res = await page.request.post("/api/query", {
      data: { connectionId, query: PROBE_QUERY },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error?.message).toMatch(
      /not part of any dashboard shared with you/i,
    );
  });
});
