import type { APIRequestContext, Page, Response } from "@playwright/test";
import {
  test,
  expect,
  ALICE,
  TEST_PG_PORT,
  createTestDashboard,
  saveDashboard,
  typeInEditor,
} from "./fixtures";
import { AuthPage } from "./pages/auth";

/**
 * A card's own requests run on the database its widget saves (#1824): a form's
 * submit and its field options, and a parameter selector's options. The harness
 * PostgreSQL holds two databases, movies and neoboard. Alice's connections here
 * default to movies and every widget is saved on neoboard, so a request that
 * drops the saved database lands on movies. Every row is created under a unique
 * name and deleted by id.
 */

const SELECT_SEED = "SELECT current_database() AS value";
const FORM_SEED = "SELECT current_database() AS value, 'form field' AS label";

function uniqueSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

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

/** The response to the dashboard's request for `query`. */
function queryResponse(page: Page, query: string): Promise<Response> {
  return page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/query") &&
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.query === query,
    { timeout: 20_000 },
  );
}

/** The request asked for the neoboard database, and neoboard answered. */
async function expectAnsweredByNeoboard(
  response: Response,
  rows: Record<string, unknown>[],
) {
  expect(response.request().postDataJSON().database).toBe("neoboard");
  expect(response.status()).toBe(200);
  expect((await response.json()).data.data).toEqual(rows);
}

test.describe("Widgets run on their saved database (#1824)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("a form saved on neoboard writes its row into neoboard, not movies", async ({
    page,
    authPage,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const suffix = uniqueSuffix();
    // A table of the same name in both databases. Identifiers cannot be bound
    // as parameters; this one is generated here.
    const table = `e2e_saved_db_${suffix}`;
    const tag = `row-${suffix}`;
    const created: string[] = [];
    let moviesConnectionId: string | undefined;
    let neoboardConnectionId: string | undefined;
    let dashboardId: string | undefined;
    const write = (connectionId: string, query: string) =>
      page.request.post("/api/query/write", { data: { connectionId, query } });
    const rowsOn = async (connectionId: string) => {
      const res = await page.request.post("/api/query", {
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
      moviesConnectionId = await createConnection(
        page.request,
        `saved-db-movies-${suffix}`,
        "movies",
      );
      neoboardConnectionId = await createConnection(
        page.request,
        `saved-db-neoboard-${suffix}`,
        "neoboard",
      );
      for (const id of [moviesConnectionId, neoboardConnectionId]) {
        const res = await write(
          id,
          `CREATE TABLE ${table} (tag text PRIMARY KEY)`,
        );
        expect(res.status()).toBe(200);
        created.push(id);
      }

      ({ id: dashboardId } = await createTestDashboard(
        page.request,
        `saved-db-form-${suffix}`,
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
                    connectionId: moviesConnectionId,
                    database: "neoboard",
                    query: `INSERT INTO ${table} (tag) VALUES ($param_tag)`,
                    settings: {
                      title: "Saved database form",
                      chartOptions: {},
                      formFields: [
                        {
                          id: "f-tag",
                          label: "Tag",
                          parameterName: "tag",
                          parameterType: "text",
                          required: true,
                        },
                        {
                          id: "f-db",
                          label: "Database",
                          parameterName: "db",
                          parameterType: "select",
                          seedQuery: FORM_SEED,
                          required: false,
                        },
                      ],
                    },
                  },
                ],
                gridLayout: [{ i: "w-form", x: 0, y: 0, w: 12, h: 10 }],
              },
            ],
          },
        },
      });
      expect(put.ok()).toBeTruthy();

      // The field's options come from the form's database.
      const fieldSeed = queryResponse(page, FORM_SEED);
      await page.goto(`/${dashboardId}`);
      await expectAnsweredByNeoboard(await fieldSeed, [
        { value: "neoboard", label: "form field" },
      ]);

      const form = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Submit" }) });
      await expect(form).toBeVisible({ timeout: 15_000 });
      await page.waitForLoadState("networkidle");
      await form.getByRole("textbox", { name: "Tag", exact: true }).fill(tag);

      const submitted = page.waitForResponse(
        (r) =>
          r.url().includes("/api/query/write") &&
          r.request().method() === "POST",
        { timeout: 15_000 },
      );
      await form.getByRole("button", { name: "Submit" }).click();
      const response = await submitted;

      // The submit names the stored form; the server picks the database.
      const body = response.request().postDataJSON();
      expect(body).toMatchObject({
        connectionId: moviesConnectionId,
        widgetId: "w-form",
        dashboardId,
        params: { param_tag: tag },
      });
      expect(body).not.toHaveProperty("database");
      expect(response.status()).toBe(200);
      await expect(form.getByText("Form submitted successfully")).toBeVisible();

      expect(await rowsOn(neoboardConnectionId)).toEqual([{ tag }]);
      expect(await rowsOn(moviesConnectionId)).toEqual([]);
    } finally {
      for (const id of created) {
        await write(id, `DROP TABLE IF EXISTS ${table}`);
      }
      if (dashboardId)
        await page.request.delete(`/api/dashboards/${dashboardId}`);
      for (const id of [moviesConnectionId, neoboardConnectionId]) {
        if (id) await page.request.delete(`/api/connections/${id}?force=true`);
      }
    }
  });

  test("a parameter select saved on neoboard lists neoboard, for its owner and a view-level user", async ({
    browser,
  }) => {
    const suffix = uniqueSuffix();
    const aliceCtx = await browser.newContext();
    const alice = await aliceCtx.newPage();
    let userId: string | undefined;
    let connectionId: string | undefined;
    let dashboardId: string | undefined;

    /** Open the dashboard: both option lists come from neoboard. */
    async function expectNeoboardOptions(page: Page) {
      const selectorSeed = queryResponse(page, SELECT_SEED);
      const fieldSeed = queryResponse(page, FORM_SEED);
      await page.goto(`/${dashboardId}`);
      await expectAnsweredByNeoboard(await selectorSeed, [
        { value: "neoboard" },
      ]);
      await expectAnsweredByNeoboard(await fieldSeed, [
        { value: "neoboard", label: "form field" },
      ]);
      await page
        .locator('[data-widget-id="w-select"]')
        .getByRole("combobox")
        .click();
      await expect(page.getByRole("option", { name: "neoboard" })).toBeVisible({
        timeout: 10_000,
      });
    }

    try {
      await new AuthPage(alice).login(ALICE.email, ALICE.password);
      const email = `saved-db-viewer-${suffix}@example.com`;
      const password = "password123";
      const userRes = await alice.request.post("/api/users", {
        data: {
          name: `Saved DB viewer ${suffix}`,
          email,
          password,
          role: "reader",
        },
      });
      expect(userRes.status()).toBe(201);
      userId = (await userRes.json()).data.id;

      connectionId = await createConnection(
        alice.request,
        `saved-db-select-${suffix}`,
        "movies",
      );
      ({ id: dashboardId } = await createTestDashboard(
        alice.request,
        `saved-db-select-${suffix}`,
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
                    id: "w-select",
                    chartType: "parameter-select",
                    connectionId,
                    database: "neoboard",
                    query: "",
                    settings: {
                      title: "Database",
                      chartOptions: {
                        parameterType: "select",
                        parameterName: "db",
                        seedQuery: SELECT_SEED,
                      },
                    },
                  },
                  {
                    id: "w-form",
                    chartType: "form",
                    connectionId,
                    database: "neoboard",
                    // Never submitted: the form is here for its field's options.
                    query:
                      "INSERT INTO e2e_never_written (db) VALUES ($param_db)",
                    settings: {
                      title: "Form",
                      chartOptions: {},
                      formFields: [
                        {
                          id: "f-db",
                          label: "Database",
                          parameterName: "db",
                          parameterType: "select",
                          seedQuery: FORM_SEED,
                        },
                      ],
                    },
                  },
                ],
                gridLayout: [
                  { i: "w-select", x: 0, y: 0, w: 6, h: 6 },
                  { i: "w-form", x: 6, y: 0, w: 6, h: 6 },
                ],
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

      await expectNeoboardOptions(alice);

      const viewerCtx = await browser.newContext();
      try {
        const viewer = await viewerCtx.newPage();
        await new AuthPage(viewer).login(email, password);
        await expectNeoboardOptions(viewer);

        // The viewer still runs the seed on its saved database only.
        for (const database of ["movies", undefined]) {
          const res = await viewer.request.post("/api/query", {
            data: { connectionId, query: SELECT_SEED, database },
          });
          expect(res.status()).toBe(403);
        }
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

  // Edit mode shows the unsaved working copy, and the write runs where the saved
  // dashboard stores the form, so a new form waits for Save.
  test("a form added in edit mode waits for Save before it can submit", async ({
    page,
    authPage,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const suffix = uniqueSuffix();
    const connectionName = `saved-db-edit-${suffix}`;
    let connectionId: string | undefined;
    let dashboardId: string | undefined;
    const writes: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/query/write")) writes.push(r.url());
    });

    try {
      connectionId = await createConnection(
        page.request,
        connectionName,
        "movies",
      );
      ({ id: dashboardId } = await createTestDashboard(
        page.request,
        `saved-db-edit-${suffix}`,
      ));
      await page.goto(`/${dashboardId}/edit`);
      await expect(
        page.getByRole("heading", { name: /^Editing:/ }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "Form" }).click();
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option", { name: connectionName }).click();
      await typeInEditor(
        dialog,
        page,
        "INSERT INTO e2e_never_written (tag) VALUES ($param_tag)",
      );
      await dialog.getByRole("button", { name: "Add Field" }).click();
      await dialog.getByPlaceholder("e.g. Movie Title").fill("Tag");
      await dialog.getByPlaceholder("e.g. title").fill("tag");
      await dialog.getByRole("button", { name: "Add Widget" }).click();
      await expect(dialog).not.toBeVisible();

      const form = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: "Submit" }) });
      const submit = form.getByRole("button", { name: "Submit" });
      const note = form.getByText("Save the dashboard to submit this form.");
      await expect(note).toBeVisible({ timeout: 15_000 });
      await expect(submit).toBeDisabled();
      await form.getByRole("textbox", { name: "tag" }).fill(`row-${suffix}`);
      await form.getByRole("textbox", { name: "tag" }).press("Enter");
      await expect(note).toBeVisible();
      expect(writes).toEqual([]);

      await saveDashboard(page);
      await expect(note).toBeHidden();
      await expect(submit).toBeEnabled();
    } finally {
      if (dashboardId)
        await page.request.delete(`/api/dashboards/${dashboardId}`);
      if (connectionId)
        await page.request.delete(
          `/api/connections/${connectionId}?force=true`,
        );
    }
  });
});
