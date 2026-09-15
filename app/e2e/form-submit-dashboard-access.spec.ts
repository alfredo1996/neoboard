import { randomUUID } from "node:crypto";
import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";
import {
  test,
  expect,
  ALICE,
  TEST_PG_PORT,
  createTestDashboard,
} from "./fixtures";
import { AuthPage } from "./pages/auth";

/**
 * Everyone who can open a dashboard can submit its forms, and a submit runs
 * only what the form saves: its query, with the values of its own fields, on
 * its saved connection and database. Adding a form, or changing a form's query,
 * connection or database, needs access to that connection (#1831). Alice's form
 * is on her private connection, which defaults to movies, and is saved on
 * neoboard, the only database holding its table. Neither submitter owns a
 * connection or has write permission; the editor share has write permission
 * but no access to Alice's connection. Every row is created under a unique name
 * and deleted by id.
 */

/** A private PostgreSQL connection of the caller's, defaulting to `database`. */
async function createConnection(
  request: APIRequestContext,
  name: string,
  database: string,
): Promise<string> {
  const res = await request.post("/api/connections", {
    data: {
      name,
      type: "postgresql",
      config: {
        uri: `postgresql://localhost:${TEST_PG_PORT}`,
        username: "neoboard",
        password: "neoboard",
        database,
        // The server keeps one driver per distinct config and closes it when a
        // connection is deleted: a unique timeout keeps this driver to itself.
        connectionTimeout: 20_000 + Math.floor(Math.random() * 280_000),
      },
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data.id as string;
}

test.describe("Anyone who can open a dashboard can submit its forms, and only people with access to its connection can write one (#1831)", () => {
  test.describe.configure({ timeout: 180_000 });

  test("a reader with a view share and a tenant user on a public dashboard submit Alice's form into neoboard; a tampered or refused submit writes nothing; an editor share without access to her connection cannot add or change a form on it", async ({
    page,
    authPage,
    browser,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Identifiers cannot be bound as parameters; this one is generated here.
    const table = `e2e_form_access_${suffix}`;
    const formQuery = `INSERT INTO ${table} (tag) VALUES ($param_tag)`;
    const password = "password123";
    const userIds: string[] = [];
    const contexts: BrowserContext[] = [];
    let formConnectionId: string | undefined;
    let neoboardConnectionId: string | undefined;
    let dashboardId = "";
    let tableCreated = false;

    /** Alice's write on her neoboard connection, naming no widget. */
    const writeOnNeoboard = (query: string) =>
      page.request.post("/api/query/write", {
        data: { connectionId: neoboardConnectionId, query },
      });
    /** The rows tagged `tag` in neoboard, as Alice reads them. */
    const rows = async (tag: string) => {
      const res = await page.request.post("/api/query", {
        data: {
          connectionId: neoboardConnectionId,
          query: `SELECT tag FROM ${table} WHERE tag = $param_tag`,
          params: { param_tag: tag },
        },
      });
      expect(res.status()).toBe(200);
      return (await res.json()).data.data;
    };
    /** A user Alice creates, without write permission unless asked, signed in on a page of their own. */
    const signIn = async (role: "reader" | "creator", canWrite = false) => {
      const email = `form-access-${role}${canWrite ? "-writer" : ""}-${suffix}@example.com`;
      const res = await page.request.post("/api/users", {
        data: {
          name: `Form access ${role} ${suffix}`,
          email,
          password,
          role,
          canWrite,
        },
      });
      expect(res.status()).toBe(201);
      userIds.push((await res.json()).data.id as string);
      const context = await browser.newContext();
      contexts.push(context);
      const userPage = await context.newPage();
      await new AuthPage(userPage).login(email, password);
      return { email, page: userPage };
    };
    /** The request a submit of the form sends, from `as`. */
    const submit = (
      as: Page,
      dashboard: string,
      tag: string,
      query = formQuery,
    ) =>
      as.request.post("/api/query/write", {
        data: {
          connectionId: formConnectionId,
          query,
          params: { param_tag: tag },
          widgetId: "w-form",
          dashboardId: dashboard,
        },
      });

    try {
      await test.step("Alice saves a form on her private connection, on database neoboard", async () => {
        formConnectionId = await createConnection(
          page.request,
          `form-access-${suffix}`,
          "movies",
        );
        neoboardConnectionId = await createConnection(
          page.request,
          `form-access-neoboard-${suffix}`,
          "neoboard",
        );
        const create = await writeOnNeoboard(
          `CREATE TABLE ${table} (tag text PRIMARY KEY)`,
        );
        expect(create.status()).toBe(200);
        tableCreated = true;

        ({ id: dashboardId } = await createTestDashboard(
          page.request,
          `form-access-${suffix}`,
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
                      connectionId: formConnectionId,
                      database: "neoboard",
                      query: formQuery,
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
      });

      const reader = await signIn("reader");
      const outsider = await signIn("creator");
      const readerTag = `reader-${suffix}`;
      const outsiderTag = `outsider-${suffix}`;

      await test.step("a reader with a view share submits it from the dashboard, into neoboard", async () => {
        const share = await page.request.post(
          `/api/dashboards/${dashboardId}/share`,
          { data: { email: reader.email, role: "viewer" } },
        );
        expect(share.ok()).toBeTruthy();

        await reader.page.goto(`/${dashboardId}`);
        const form = reader.page
          .locator("form")
          .filter({ has: reader.page.getByRole("button", { name: "Submit" }) });
        await expect(form).toBeVisible({ timeout: 15_000 });
        await reader.page.waitForLoadState("networkidle");
        await form
          .getByRole("textbox", { name: "Tag", exact: true })
          .fill(readerTag);
        // Together, so a failed click leaves no response wait to reject later.
        const [response] = await Promise.all([
          reader.page.waitForResponse(
            (r) =>
              r.url().includes("/api/query/write") &&
              r.request().method() === "POST",
            { timeout: 15_000 },
          ),
          form.getByRole("button", { name: "Submit" }).click(),
        ]);

        expect(response.request().postDataJSON()).toMatchObject({
          connectionId: formConnectionId,
          query: formQuery,
          params: { param_tag: readerTag },
          widgetId: "w-form",
          dashboardId,
        });
        expect(response.status()).toBe(200);
        await expect(
          form.getByText("Form submitted successfully"),
        ).toBeVisible();
        expect(await rows(readerTag)).toEqual([{ tag: readerTag }]);
      });

      await test.step("the reader's tampered submit, with other query text, runs nothing", async () => {
        const unknown = await submit(reader.page, randomUUID(), readerTag);
        const tampered = await submit(
          reader.page,
          dashboardId,
          readerTag,
          `DELETE FROM ${table} WHERE tag = $param_tag`,
        );
        expect(unknown.status()).toBe(404);
        expect(tampered.status()).toBe(unknown.status());
        expect(await tampered.json()).toEqual(await unknown.json());
        expect(await rows(readerTag)).toEqual([{ tag: readerTag }]);
      });

      await test.step("an editor share without access to Alice's connection cannot add a form on it or change her form's query, and can still move her form", async () => {
        const editor = await signIn("creator", true);
        const share = await page.request.post(
          `/api/dashboards/${dashboardId}/share`,
          { data: { email: editor.email, role: "editor" } },
        );
        expect(share.ok()).toBeTruthy();
        /** The layout stored on the dashboard, as Alice reads it. */
        const storedLayout = async () =>
          (
            await (
              await page.request.get(`/api/dashboards/${dashboardId}`)
            ).json()
          ).data.layoutJson;
        const stored = await storedLayout();
        const [storedPage] = stored.pages;
        const [form] = storedPage.widgets;
        const deleteQuery = `DELETE FROM ${table} WHERE tag = $param_tag`;
        /** The editor saves Alice's page with these widgets and grid. */
        const save = (widgets: unknown[], gridLayout: unknown[]) =>
          editor.page.request.put(`/api/dashboards/${dashboardId}`, {
            data: {
              layoutJson: {
                ...stored,
                pages: [{ ...storedPage, widgets, gridLayout }],
              },
            },
          });
        const refusal =
          "You can only add or change forms on connections you have access to";

        const added = await save(
          [form, { ...form, id: "w-added", query: deleteQuery }],
          [...storedPage.gridLayout, { i: "w-added", x: 0, y: 6, w: 12, h: 6 }],
        );
        expect(added.status()).toBe(403);
        expect((await added.json()).error.message).toBe(refusal);

        const changed = await save(
          [{ ...form, query: deleteQuery }],
          storedPage.gridLayout,
        );
        expect(changed.status()).toBe(403);
        expect((await changed.json()).error.message).toBe(refusal);
        expect(await storedLayout()).toEqual(stored);

        const moved = await save(
          [form],
          [{ i: "w-form", x: 0, y: 2, w: 8, h: 6 }],
        );
        expect(moved.status()).toBe(200);
        expect((await storedLayout()).pages[0].widgets).toEqual([form]);
      });

      await test.step("Alice's form still submits for the reader, and nothing it wrote is gone", async () => {
        const tag = `reader-again-${suffix}`;
        const res = await submit(reader.page, dashboardId, tag);
        expect(res.status()).toBe(200);
        expect(await rows(tag)).toEqual([{ tag }]);
        expect(await rows(readerTag)).toEqual([{ tag: readerTag }]);
      });

      await test.step("a tenant user who cannot open the dashboard is refused, and writes nothing", async () => {
        const unknown = await submit(outsider.page, randomUUID(), outsiderTag);
        const refused = await submit(outsider.page, dashboardId, outsiderTag);
        expect(unknown.status()).toBe(404);
        expect(refused.status()).toBe(unknown.status());
        expect(await refused.json()).toEqual(await unknown.json());
        expect(await rows(outsiderTag)).toEqual([]);
      });

      await test.step("once Alice makes the dashboard public, the same user's submit writes", async () => {
        const made = await page.request.put(`/api/dashboards/${dashboardId}`, {
          data: { isPublic: true },
        });
        expect(made.ok()).toBeTruthy();
        const res = await submit(outsider.page, dashboardId, outsiderTag);
        expect(res.status()).toBe(200);
        expect(await rows(outsiderTag)).toEqual([{ tag: outsiderTag }]);
      });
    } finally {
      if (tableCreated) await writeOnNeoboard(`DROP TABLE IF EXISTS ${table}`);
      if (dashboardId)
        await page.request.delete(`/api/dashboards/${dashboardId}`);
      for (const id of [formConnectionId, neoboardConnectionId]) {
        if (id) await page.request.delete(`/api/connections/${id}?force=true`);
      }
      for (const id of userIds) await page.request.delete(`/api/users/${id}`);
      for (const context of contexts) await context.close();
    }
  });
});
