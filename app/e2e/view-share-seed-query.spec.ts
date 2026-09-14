import {
  test,
  expect,
  ALICE,
  TEST_NEO4J_BOLT_URL,
  createTestDashboard,
} from "./fixtures";
import { AuthPage } from "./pages/auth";
import type { Browser, Page, Response } from "@playwright/test";

/**
 * A viewer share is bound to the queries its dashboard contains (#972). The
 * seed queries behind option lists are among them, stored where the editor
 * saves them: a parameter selector's under settings.chartOptions, a form's on
 * each of settings.formFields. Every row here is created under a unique id on
 * a private connection, so the viewer's only claim on it is the share.
 */

const SEED =
  "MATCH (m:Movie) RETURN DISTINCT m.released AS value ORDER BY value LIMIT 5";

type Widget = Record<string, unknown>;

async function withViewerShare(
  browser: Browser,
  widgets: (connectionId: string) => Widget[],
  fn: (viewer: Page, dashboardId: string) => Promise<void>,
) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const aliceCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  let userId: string | undefined;
  let connectionId: string | undefined;
  let dashboardId: string | undefined;
  try {
    await new AuthPage(alice).login(ALICE.email, ALICE.password);
    const email = `seed-viewer-${suffix}@example.com`;
    const password = "password123";
    const userRes = await alice.request.post("/api/users", {
      data: { name: `Seed viewer ${suffix}`, email, password, role: "creator" },
    });
    expect(userRes.status()).toBe(201);
    userId = (await userRes.json()).data.id;

    const connRes = await alice.request.post("/api/connections", {
      data: {
        name: `seed-share-${suffix}`,
        type: "neo4j",
        config: {
          uri: TEST_NEO4J_BOLT_URL,
          username: "neo4j",
          password: "neoboard123",
        },
      },
    });
    expect(connRes.status()).toBe(201);
    connectionId = (await connRes.json()).data.id as string;

    ({ id: dashboardId } = await createTestDashboard(
      alice.request,
      `seed-share-${suffix}`,
    ));
    const ws = widgets(connectionId);
    const put = await alice.request.put(`/api/dashboards/${dashboardId}`, {
      data: {
        layoutJson: {
          version: 2,
          pages: [
            {
              id: "p1",
              title: "Page 1",
              widgets: ws,
              gridLayout: ws.map((w, i) => ({
                i: w.id,
                x: i * 6,
                y: 0,
                w: 6,
                h: 6,
              })),
            },
          ],
        },
      },
    });
    expect(put.ok()).toBeTruthy();
    const share = await alice.request.post(
      `/api/dashboards/${dashboardId}/share`,
      { data: { email, role: "viewer" } },
    );
    expect(share.ok()).toBeTruthy();

    const viewerCtx = await browser.newContext();
    try {
      const viewer = await viewerCtx.newPage();
      await new AuthPage(viewer).login(email, password);
      await fn(viewer, dashboardId);
    } finally {
      await viewerCtx.close();
    }
  } finally {
    if (dashboardId)
      await alice.request.delete(`/api/dashboards/${dashboardId}`);
    if (connectionId)
      await alice.request.delete(`/api/connections/${connectionId}?force=true`);
    if (userId) await alice.request.delete(`/api/users/${userId}`);
    await aliceCtx.close();
  }
}

function seedResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/query") &&
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.query === SEED,
    { timeout: 20_000 },
  );
}

test.describe("Viewer share runs the dashboard's seed queries", () => {
  test.describe.configure({ timeout: 90_000 });

  test("parameter selector options load for a view-only share", async ({
    browser,
  }) => {
    await withViewerShare(
      browser,
      (connectionId) => [
        {
          id: "w-param",
          chartType: "parameter-select",
          connectionId,
          query: "",
          settings: {
            title: "Year",
            chartOptions: {
              parameterType: "select",
              parameterName: "year",
              seedQuery: SEED,
            },
          },
        },
        {
          id: "w-table",
          chartType: "table",
          connectionId,
          query:
            "MATCH (m:Movie) WHERE m.released = $param_year RETURN m.title AS title LIMIT 5",
          settings: { title: "Movies" },
        },
      ],
      async (viewer, id) => {
        const seed = seedResponse(viewer);
        await viewer.goto(`/${id}`);
        expect((await seed).status()).toBe(200);

        await viewer.getByRole("combobox").first().click();
        await expect(viewer.getByRole("option").first()).toBeVisible({
          timeout: 10_000,
        });
      },
    );
  });

  test("form select options load for a view-only share", async ({
    browser,
  }) => {
    await withViewerShare(
      browser,
      (connectionId) => [
        {
          id: "w-form",
          chartType: "form",
          connectionId,
          query: "CREATE (n:SeedShareE2E {year: $param_year}) RETURN n.year",
          settings: {
            title: "Form",
            chartOptions: {},
            formFields: [
              {
                id: "f-year",
                label: "Year",
                parameterName: "year",
                parameterType: "select",
                seedQuery: SEED,
              },
            ],
          },
        },
      ],
      async (viewer, id) => {
        const seed = seedResponse(viewer);
        await viewer.goto(`/${id}`);
        expect((await seed).status()).toBe(200);

        await viewer.getByRole("combobox").first().click();
        await expect(viewer.getByRole("option").first()).toBeVisible({
          timeout: 10_000,
        });
      },
    );
  });
});
