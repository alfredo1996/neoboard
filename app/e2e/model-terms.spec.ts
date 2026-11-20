import {
  test,
  expect,
  ALICE,
  CAROL,
  TEST_NEO4J_BOLT_URL,
  TEST_PG_PORT,
  uid,
} from "./fixtures";
import { AuthPage } from "./pages/auth";
import type { Browser, Page } from "@playwright/test";

/**
 * The Model page (#2415): a creator describes a term, it survives a refresh of
 * the connection's structure, and a reader sees it without being able to edit.
 *
 * Hermetic: both connections are created here, shared with the workspace, and
 * deleted by id. The seeded connections are not touched.
 */
test.describe.serial("Model page terms (#2415)", () => {
  const suffix = uid();
  const graphName = `model-graph-${suffix}`;
  const sqlName = `model-sql-${suffix}`;
  const ids: string[] = [];

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
      };
      await make(graphName, "neo4j", {
        uri: TEST_NEO4J_BOLT_URL,
        username: "neo4j",
        password: "neoboard123",
      });
      await make(sqlName, "postgresql", {
        uri: `postgresql://localhost:${TEST_PG_PORT}`,
        username: "neoboard",
        password: "neoboard",
        database: "movies",
      });
    });
  });

  test.afterAll(async ({ browser }) => {
    await asAlice(browser, async (page) => {
      for (const id of ids) {
        await page.request.delete(`/api/connections/${id}?force=true`);
      }
    });
  });

  const section = (page: Page, name: string) =>
    page.getByRole("region", { name, exact: true });

  const saved = (page: Page) =>
    page.waitForResponse(
      (r) =>
        r.url().includes("/ontology") &&
        r.request().method() === "PUT" &&
        r.ok(),
    );

  test("a creator describes a term and it survives a refresh of the structure", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.goto("/model");

    const cases = [
      { name: graphName, term: "Person", text: "Someone in the film business" },
      { name: sqlName, term: "movies.released", text: "release year" },
    ];
    for (const { name, term, text } of cases) {
      const box = section(page, name);
      const field = box.getByLabel(`Description of ${term}`, { exact: true });
      await expect(field).toBeVisible({ timeout: 30_000 });
      const put = saved(page);
      await field.fill(text);
      await field.blur();
      await put;

      // Refresh the structure: the connection is introspected again.
      const reread = page.waitForResponse(
        (r) => r.url().includes("/ontology") && r.request().method() === "GET",
      );
      await box
        .getByRole("button", {
          name: `Refresh the structure of ${name}`,
          exact: true,
        })
        .click();
      await reread;
      await expect(
        box.getByLabel(`Description of ${term}`, { exact: true }),
      ).toHaveValue(text);
    }

    // And after a full reload, from the database.
    await page.reload();
    await expect(
      section(page, graphName).getByLabel("Description of Person", {
        exact: true,
      }),
    ).toHaveValue("Someone in the film business", { timeout: 30_000 });
  });

  test("a reader sees the description and cannot edit it", async ({
    authPage,
    page,
  }) => {
    await authPage.login(CAROL.email, CAROL.password);
    await page.goto("/model");
    const box = section(page, graphName);
    await expect(
      box.getByText("Someone in the film business", { exact: true }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      box.getByLabel("Description of Person", { exact: true }),
    ).toHaveCount(0);
    await expect(
      box.getByRole("switch", { name: "Hide Person", exact: true }),
    ).toBeDisabled();
  });

  test("a reader reaches the Model page from the connection's menu", async ({
    authPage,
    page,
  }) => {
    await authPage.login(CAROL.email, CAROL.password);
    await page.goto("/connections");
    await page
      .getByRole("button", {
        name: `Connection actions for ${graphName}`,
        exact: true,
      })
      .click();
    await page.getByRole("menuitem", { name: "Model", exact: true }).click();
    await expect(page).toHaveURL(/\/model#connection-/);
    await expect(
      section(page, graphName).getByLabel("Description of Person", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      section(page, graphName).getByText("Someone in the film business", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
