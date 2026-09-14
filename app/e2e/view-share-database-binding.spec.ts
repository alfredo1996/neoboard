import {
  test,
  expect,
  ALICE,
  TEST_PG_PORT,
  createTestDashboard,
} from "./fixtures";
import { AuthPage } from "./pages/auth";

/**
 * A viewer share runs only the queries its dashboard contains (#972), and
 * each only on the database its widget saves (#1822). The harness PostgreSQL
 * holds two databases, movies and neoboard. Alice's private connection
 * defaults to neoboard and her one widget runs on movies, so the viewer's only
 * claim on the connection is that widget. Every row is created under a unique
 * name and deleted by id.
 */

const QUERY = "SELECT current_database() AS db";

test.describe("Viewer share runs a saved query on its saved database only", () => {
  test.describe.configure({ timeout: 90_000 });

  test("the widget's database answers 200, another database 403", async ({
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
      const email = `db-viewer-${suffix}@example.com`;
      const password = "password123";
      const userRes = await alice.request.post("/api/users", {
        data: { name: `DB viewer ${suffix}`, email, password, role: "reader" },
      });
      expect(userRes.status()).toBe(201);
      userId = (await userRes.json()).data.id;

      const connRes = await alice.request.post("/api/connections", {
        data: {
          name: `db-binding-${suffix}`,
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
        `db-binding-${suffix}`,
      ));
      const put = await alice.request.put(`/api/dashboards/${dashboardId}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [
              {
                id: "p1",
                title: "Page 1",
                widgets: [
                  {
                    id: "w-db",
                    chartType: "table",
                    connectionId,
                    database: "movies",
                    query: QUERY,
                    settings: { title: "Database" },
                  },
                ],
                gridLayout: [{ i: "w-db", x: 0, y: 0, w: 6, h: 6 }],
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

        // The dashboard still works for the viewer: its widget asks for the
        // saved database and gets that database's answer.
        const shown = viewer.waitForResponse(
          (r) =>
            r.url().endsWith("/api/query") &&
            r.request().method() === "POST" &&
            r.request().postDataJSON()?.query === QUERY,
          { timeout: 20_000 },
        );
        await viewer.goto(`/${dashboardId}`);
        const widget = await shown;
        expect(widget.request().postDataJSON().database).toBe("movies");
        expect(widget.status()).toBe(200);
        expect((await widget.json()).data.data).toEqual([{ db: "movies" }]);

        const run = (database: string) =>
          viewer.request.post("/api/query", {
            data: { connectionId, query: QUERY, database },
          });

        const other = await run("neoboard");
        expect(other.status()).toBe(403);
        expect((await other.json()).error.message).toMatch(
          /not part of any dashboard/i,
        );

        const saved = await run("movies");
        expect(saved.status()).toBe(200);
        expect((await saved.json()).data.data).toEqual([{ db: "movies" }]);
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
