import {
  test,
  expect,
  ALICE,
  BOB,
  CAROL,
  TEST_NEO4J_BOLT_URL,
  TEST_PG_PORT,
  uid,
} from "./fixtures";
import { AuthPage } from "./pages/auth";
import type { Browser, Page } from "@playwright/test";

/**
 * Concepts on the Model page (#2484): a creator links a graph entity and a SQL
 * table by a shared key, the concept and both sides survive a reload, and a
 * reader sees it without being able to edit.
 *
 * Hermetic: both connections are created here, shared with the workspace, and
 * deleted by id (which takes their sides with them). The seeded connections
 * are not touched.
 */
test.describe.serial("Model page concepts (#2484)", () => {
  const suffix = uid();
  const graphName = `concept-graph-${suffix}`;
  const sqlName = `concept-sql-${suffix}`;
  const conceptName = `Movie ${suffix}`;
  const ids: string[] = [];
  const conceptIds: string[] = [];
  let graphId = "";
  let sqlId = "";

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
    await asAlice(browser, async (page) => {
      const make = async (
        name: string,
        type: string,
        config: Record<string, string>,
      ) => {
        const res = await page.request.post("/api/connections", {
          data: { name, type, config },
        });
        expect(res.status()).toBe(201);
        const id = (await res.json()).data.id as string;
        ids.push(id);
        const share = await page.request.patch(`/api/connections/${id}`, {
          data: { visibility: "shared" },
        });
        expect(share.ok()).toBeTruthy();
        return id;
      };
      graphId = await make(graphName, "neo4j", {
        uri: TEST_NEO4J_BOLT_URL,
        username: "neo4j",
        password: "neoboard123",
      });
      sqlId = await make(sqlName, "postgresql", {
        uri: `postgresql://localhost:${TEST_PG_PORT}`,
        username: "neoboard",
        password: "neoboard",
        database: "movies",
      });
    });
  });

  test.afterAll(async ({ browser }) => {
    await asAlice(browser, async (page) => {
      for (const id of conceptIds) {
        await page.request.delete(`/api/ontology/concepts/${id}`);
      }
      for (const id of ids) {
        await page.request.delete(`/api/connections/${id}?force=true`);
      }
    });
  });

  const pick = async (
    dialog: ReturnType<Page["getByRole"]>,
    label: string,
    index: number,
    value: string,
  ) => {
    const control = dialog.getByLabel(`${label}, side ${index + 1}`, {
      exact: true,
    });
    // The options of an entity or key picker arrive once the connection's terms do.
    await expect(control.locator(`option[value="${value}"]`)).toHaveCount(1, {
      timeout: 30_000,
    });
    await control.selectOption(value);
  };

  test("a creator links a graph entity and a SQL table, and both sides survive a reload", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.goto("/model");
    await page
      .getByRole("button", { name: "New concept", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Name/).fill(conceptName);
    await expect(dialog.getByLabel(/^Parameter/)).toHaveValue(
      `movie_${suffix}`,
    );

    await pick(dialog, "Connection", 0, graphId);
    await pick(dialog, "Entity", 0, "Movie");
    await pick(dialog, "Key property", 0, "title");

    await dialog.getByRole("button", { name: "Add side", exact: true }).click();
    await pick(dialog, "Connection", 1, sqlId);
    await pick(dialog, "Entity", 1, "movies");
    await pick(dialog, "Key property", 1, "title");

    const saved = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/ontology/concepts") &&
        r.request().method() === "POST" &&
        r.status() === 201,
    );
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    conceptIds.push((await (await saved).json()).data.id);
    await expect(dialog).toBeHidden();

    await page.reload();
    const row = page.getByText(conceptName, { exact: true });
    await expect(row).toBeVisible({ timeout: 30_000 });
    const graphSide = page.getByTestId(
      `concept-side-group-${conceptIds[0]}-${graphId}`,
    );
    const sqlSide = page.getByTestId(
      `concept-side-group-${conceptIds[0]}-${sqlId}`,
    );
    await expect(graphSide).toContainText(graphName);
    await expect(graphSide).toContainText("Movie");
    await expect(graphSide).toContainText("title");
    await expect(sqlSide).toContainText(sqlName);
    await expect(sqlSide).toContainText("movies");
    await expect(sqlSide).toContainText("title");
  });

  test("a reader sees the concept and cannot edit it", async ({
    authPage,
    page,
  }) => {
    await authPage.login(CAROL.email, CAROL.password);
    await page.goto("/model");
    await expect(page.getByText(conceptName, { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByTestId(`concept-side-group-${conceptIds[0]}-${sqlId}`),
    ).toContainText("movies");
    await expect(
      page.getByRole("button", { name: "New concept", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Edit ${conceptName}`, exact: true }),
    ).toHaveCount(0);
  });
});

/**
 * #2553: a creator cannot change the parameter of a concept that is also on a
 * connection they cannot open. Alice (admin) builds a concept on a shared graph
 * connection and a private SQL one; Bob (creator) can use only the first.
 */
test.describe.serial("Concept parameter change (#2553)", () => {
  const suffix = uid();
  const conceptName = `Guarded ${suffix}`;
  const parameter = `guarded_${suffix}`;
  const connIds: string[] = [];
  let conceptId = "";

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
    await asAlice(browser, async (page) => {
      const make = async (
        name: string,
        type: string,
        config: Record<string, string>,
        visibility: string,
      ) => {
        const res = await page.request.post("/api/connections", {
          data: { name, type, config },
        });
        expect(res.status()).toBe(201);
        const id = (await res.json()).data.id as string;
        connIds.push(id);
        const set = await page.request.patch(`/api/connections/${id}`, {
          data: { visibility },
        });
        expect(set.ok()).toBeTruthy();
        return id;
      };
      const graphId = await make(
        `guard-graph-${suffix}`,
        "neo4j",
        {
          uri: TEST_NEO4J_BOLT_URL,
          username: "neo4j",
          password: "neoboard123",
        },
        "shared",
      );
      const sqlId = await make(
        `guard-sql-${suffix}`,
        "postgresql",
        {
          uri: `postgresql://localhost:${TEST_PG_PORT}`,
          username: "neoboard",
          password: "neoboard",
          database: "movies",
        },
        "private",
      );
      const res = await page.request.post("/api/ontology/concepts", {
        data: {
          name: conceptName,
          parameter,
          description: "",
          sides: [
            {
              connectionId: graphId,
              entityKey: "Movie",
              keyPropertyKey: "title",
            },
            {
              connectionId: sqlId,
              entityKey: "movies",
              keyPropertyKey: "title",
            },
          ],
        },
      });
      expect(res.status()).toBe(201);
      conceptId = (await res.json()).data.id;
    });
  });

  test.afterAll(async ({ browser }) => {
    await asAlice(browser, async (page) => {
      if (conceptId) {
        await page.request.delete(`/api/ontology/concepts/${conceptId}`);
      }
      for (const id of connIds) {
        await page.request.delete(`/api/connections/${id}?force=true`);
      }
    });
  });

  test("a creator who cannot open one connection is refused, and the parameter stays", async ({
    authPage,
    page,
  }) => {
    await authPage.login(BOB.email, BOB.password);
    await page.goto("/model");
    const edit = page.getByRole("button", {
      name: `Edit ${conceptName}`,
      exact: true,
    });
    await edit.click({ timeout: 30_000 });
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Parameter/).fill(`${parameter}_new`);
    await expect(
      dialog.getByText(
        `Widgets that use $param_${parameter} keep the old name. Update them to keep filtering together.`,
        { exact: true },
      ),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      dialog.getByText(
        "This concept is used on connections you can't open; ask an admin to change its parameter.",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 30_000 });

    await page.reload();
    await edit.click({ timeout: 30_000 });
    await expect(page.getByRole("dialog").getByLabel(/^Parameter/)).toHaveValue(
      parameter,
    );
  });
});
