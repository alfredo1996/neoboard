import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  ALICE,
  TEST_PG_PORT,
  createTestDashboard,
} from "./fixtures";
import { AuthPage } from "./pages/auth";

/**
 * A form submit names its dashboard and widget. The write route checks that
 * the submitter can open that dashboard before it reads the widget, and
 * refuses a dashboard they cannot open exactly as one that does not exist.
 * Every row is created under a unique name and deleted by id.
 */

test.describe("Form submits check dashboard access", () => {
  test.describe.configure({ timeout: 120_000 });

  test("a writer who cannot open a dashboard is refused its form like a dashboard that does not exist, and nothing is written", async ({
    page,
    authPage,
    browser,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Identifiers cannot be bound as parameters; this one is generated here.
    const table = `e2e_write_access_${suffix}`;
    const tag = `row-${suffix}`;
    const email = `write-access-${suffix}@example.com`;
    const password = "password123";
    const writerCtx = await browser.newContext();
    const writer = await writerCtx.newPage();
    let userId: string | undefined;
    let connectionId: string | undefined;
    let dashboardId: string | undefined;
    let tableCreated = false;

    const write = (data: Record<string, unknown>) =>
      writer.request.post("/api/query/write", {
        data: { connectionId, ...data },
      });
    const submit = (dashboard: string) =>
      write({
        query: `INSERT INTO ${table} (tag) VALUES ($param_tag)`,
        params: { param_tag: tag },
        widgetId: "w-form",
        dashboardId: dashboard,
      });
    const rows = async () => {
      const res = await writer.request.post("/api/query", {
        data: {
          connectionId,
          query: `SELECT tag FROM ${table} WHERE tag = $param_tag`,
          params: { param_tag: tag },
        },
      });
      expect(res.status()).toBe(200);
      return (await res.json()).data.data;
    };

    try {
      // A second writer, who owns the connection the form writes through.
      const userRes = await page.request.post("/api/users", {
        data: {
          name: `Write access ${suffix}`,
          email,
          password,
          role: "creator",
          canWrite: true,
        },
      });
      expect(userRes.status()).toBe(201);
      userId = (await userRes.json()).data.id;
      await new AuthPage(writer).login(email, password);

      const connRes = await writer.request.post("/api/connections", {
        data: {
          name: `write-access-${suffix}`,
          type: "postgresql",
          config: {
            uri: `postgresql://localhost:${TEST_PG_PORT}`,
            username: "neoboard",
            password: "neoboard",
            database: "movies",
            // The server keeps one driver per distinct config and closes it
            // when a connection is deleted: a unique timeout keeps this one.
            connectionTimeout: 20_000 + Math.floor(Math.random() * 280_000),
          },
        },
      });
      expect(connRes.status()).toBe(201);
      connectionId = (await connRes.json()).data.id;
      const create = await write({
        query: `CREATE TABLE ${table} (tag text PRIMARY KEY)`,
      });
      expect(create.status()).toBe(200);
      tableCreated = true;

      // Alice's private dashboard holds a form on that connection.
      ({ id: dashboardId } = await createTestDashboard(
        page.request,
        `write-access-${suffix}`,
      ));
      const put = await page.request.put(`/api/dashboards/${dashboardId}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [
              {
                id: "p1",
                title: "Page 1",
                widgets: [
                  {
                    id: "w-form",
                    chartType: "form",
                    connectionId,
                    query: `INSERT INTO ${table} (tag) VALUES ($param_tag)`,
                    settings: {
                      title: "Access form",
                      chartOptions: {},
                      formFields: [
                        {
                          id: "f-tag",
                          label: "Tag",
                          parameterName: "tag",
                          parameterType: "text",
                          required: true,
                        },
                      ],
                    },
                  },
                ],
                gridLayout: [{ i: "w-form", x: 0, y: 0, w: 12, h: 6 }],
              },
            ],
          },
        },
      });
      expect(put.ok()).toBeTruthy();

      const unknown = await submit(randomUUID());
      const refused = await submit(dashboardId);
      expect(unknown.status()).toBe(404);
      expect(refused.status()).toBe(unknown.status());
      expect(await refused.json()).toEqual(await unknown.json());
      expect(await rows()).toEqual([]);

      // The same submit writes once the writer can open the dashboard.
      const share = await page.request.post(
        `/api/dashboards/${dashboardId}/share`,
        { data: { email, role: "viewer" } },
      );
      expect(share.ok()).toBeTruthy();
      expect((await submit(dashboardId)).status()).toBe(200);
      expect(await rows()).toEqual([{ tag }]);
    } finally {
      if (tableCreated) await write({ query: `DROP TABLE IF EXISTS ${table}` });
      if (dashboardId)
        await page.request.delete(`/api/dashboards/${dashboardId}`);
      if (connectionId)
        await writer.request.delete(
          `/api/connections/${connectionId}?force=true`,
        );
      await writerCtx.close();
      if (userId) await page.request.delete(`/api/users/${userId}`);
    }
  });
});
