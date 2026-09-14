import {
  test,
  expect,
  ALICE,
  TEST_PG_PORT,
  createTestDashboard,
} from "./fixtures";
import { AuthPage } from "./pages/auth";
import type { Page, Response } from "@playwright/test";

/**
 * A viewer share runs only the queries its dashboard contains (#972), each as
 * its exact saved text. Clients send the saved strings verbatim, comments,
 * line breaks and trailing whitespace included, so the dashboard keeps working
 * for the viewer: its widget loads and refreshes, and its option lists fill.
 * Alice's private connection gives the viewer no claim on it but the share.
 * Every row is created under a unique name and deleted by id.
 */

/** A hand-written widget query, with a comment on its own line. */
const SAVED = [
  "-- Years on this dashboard",
  "SELECT n AS year",
  "FROM generate_series(2001, 2003) AS n",
  "ORDER BY n",
].join("\n");

/** The same statement with one line break moved. */
const LINE_BREAK_MOVED = [
  "-- Years on this dashboard",
  "SELECT n AS year FROM",
  "generate_series(2001, 2003) AS n",
  "ORDER BY n",
].join("\n");

/** Option lists saved with CRLF line breaks, a comment and trailing whitespace. */
const SELECTOR_SEED =
  "SELECT n AS value\r\nFROM generate_series(1, 3) AS n  \r\n";
const FORM_SEED =
  "SELECT n AS value -- field options\nFROM generate_series(4, 6) AS n\n";

/** The next POST /api/query from `page` that sends exactly `query`. */
function sends(page: Page, query: string): Promise<Response> {
  return page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/query") &&
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.query === query,
    { timeout: 20_000 },
  );
}

test.describe("Viewer share runs each saved query as its exact saved text", () => {
  test.describe.configure({ timeout: 90_000 });

  test("the saved texts load and refresh, and a line-break variant gets 403", async ({
    browser,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const aliceCtx = await browser.newContext();
    const alice = await aliceCtx.newPage();
    let userId: string | undefined;
    let connectionId: string | undefined;
    let dashboardId: string | undefined;
    try {
      await new AuthPage(alice).login(ALICE.email, ALICE.password);
      const email = `text-viewer-${suffix}@example.com`;
      const password = "password123";
      const userRes = await alice.request.post("/api/users", {
        data: {
          name: `Text viewer ${suffix}`,
          email,
          password,
          role: "creator",
        },
      });
      expect(userRes.status()).toBe(201);
      userId = (await userRes.json()).data.id;

      const connRes = await alice.request.post("/api/connections", {
        data: {
          name: `saved-text-${suffix}`,
          type: "postgresql",
          config: {
            uri: `postgresql://localhost:${TEST_PG_PORT}`,
            username: "neoboard",
            password: "neoboard",
            database: "neoboard",
            // The server keeps one driver per distinct connection config, and
            // deleting a connection closes the driver for its config. A unique
            // timeout keeps this test's driver apart from every other
            // connection to the same database.
            connectionTimeout: 20_000 + Math.floor(Math.random() * 280_000),
          },
        },
      });
      expect(connRes.status()).toBe(201);
      connectionId = (await connRes.json()).data.id as string;

      ({ id: dashboardId } = await createTestDashboard(
        alice.request,
        `saved-text-${suffix}`,
      ));
      const widgets = [
        {
          id: "w-years",
          chartType: "table",
          connectionId,
          query: SAVED,
          settings: {
            title: "Years",
            chartOptions: { showRefreshButton: true },
          },
        },
        {
          id: "w-pick",
          chartType: "parameter-select",
          connectionId,
          query: "",
          settings: {
            title: "Pick",
            chartOptions: {
              parameterType: "select",
              parameterName: "pick",
              seedQuery: SELECTOR_SEED,
            },
          },
        },
        {
          id: "w-form",
          chartType: "form",
          connectionId,
          query: "SELECT $param_choice AS choice",
          settings: {
            title: "Form",
            chartOptions: {},
            formFields: [
              {
                id: "f-choice",
                label: "Choice",
                parameterName: "choice",
                parameterType: "select",
                seedQuery: FORM_SEED,
              },
            ],
          },
        },
      ];
      const put = await alice.request.put(`/api/dashboards/${dashboardId}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [
              {
                id: "p1",
                title: "Page 1",
                widgets,
                gridLayout: widgets.map((w, i) => ({
                  i: w.id,
                  x: i * 4,
                  y: 0,
                  w: 4,
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

        // Every client path sends its saved text exactly as saved, and runs.
        const loads = [SAVED, SELECTOR_SEED, FORM_SEED].map((query) =>
          sends(viewer, query),
        );
        await viewer.goto(`/${dashboardId}`);
        const [widget, ...seeds] = await Promise.all(loads);
        expect(widget.status()).toBe(200);
        expect((await widget.json()).data.data).toEqual([
          { year: 2001 },
          { year: 2002 },
          { year: 2003 },
        ]);
        for (const seed of seeds) expect(seed.status()).toBe(200);

        // A refresh sends the saved text again.
        const refreshed = sends(viewer, SAVED);
        await viewer
          .getByTestId("widget-card")
          .filter({ hasText: "Years" })
          .getByRole("button", { name: "Refresh" })
          .click();
        expect((await refreshed).status()).toBe(200);

        const run = (query: string) =>
          viewer.request.post("/api/query", { data: { connectionId, query } });
        expect((await run(SAVED)).status()).toBe(200);

        const moved = await run(LINE_BREAK_MOVED);
        expect(moved.status()).toBe(403);
        expect((await moved.json()).error.message).toMatch(
          /not part of any dashboard/i,
        );
      } finally {
        await viewerCtx.close();
      }
    } finally {
      if (dashboardId)
        await alice.request.delete(`/api/dashboards/${dashboardId}`);
      if (connectionId)
        await alice.request.delete(
          `/api/connections/${connectionId}?force=true`,
        );
      if (userId) await alice.request.delete(`/api/users/${userId}`);
      await aliceCtx.close();
    }
  });
});
