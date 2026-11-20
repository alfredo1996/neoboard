import { readFile } from "node:fs/promises";
import {
  test,
  expect,
  ALICE,
  CAROL,
  TEST_NEO4J_BOLT_URL,
  uid,
} from "./fixtures";
import { AuthPage } from "./pages/auth";
import type { Browser, Page } from "@playwright/test";

/**
 * Export and import of the Model (#2510): a creator exports the descriptions
 * and a concept, someone changes a description, importing the file with its
 * connection mapped brings the original back, and a reader can export but not
 * import.
 *
 * Hermetic: one connection is created here, shared, and deleted by id (which
 * takes its terms and concept sides with it).
 */
test.describe.serial("Model export and import (#2510)", () => {
  const suffix = uid();
  const connName = `ontology-io-${suffix}`;
  const conceptName = `Film ${suffix}`;
  let connId = "";
  let conceptId = "";
  let exported = "";

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

  const describeMovie = (page: Page, description: string) =>
    page.request.put(`/api/connections/${connId}/ontology`, {
      data: {
        terms: [
          {
            kind: "entity",
            key: "Movie",
            parentKey: "",
            displayName: "Film",
            description,
          },
        ],
      },
    });
  const movieDescription = async (page: Page) => {
    const res = await page.request.get(`/api/connections/${connId}/ontology`);
    const terms = (await res.json()).data.terms as {
      key: string;
      kind: string;
      description: string;
    }[];
    return terms.find((t) => t.kind === "entity" && t.key === "Movie")
      ?.description;
  };

  test.beforeAll(async ({ browser }) => {
    await asAlice(browser, async (page) => {
      const res = await page.request.post("/api/connections", {
        data: {
          name: connName,
          type: "neo4j",
          config: {
            uri: TEST_NEO4J_BOLT_URL,
            username: "neo4j",
            password: "neoboard123",
          },
        },
      });
      expect(res.status()).toBe(201);
      connId = (await res.json()).data.id;
      const share = await page.request.patch(`/api/connections/${connId}`, {
        data: { visibility: "shared" },
      });
      expect(share.ok()).toBeTruthy();
      expect((await describeMovie(page, "Original")).ok()).toBeTruthy();
      const concept = await page.request.post("/api/ontology/concepts", {
        data: {
          name: conceptName,
          parameter: `film_${suffix}`,
          description: "A film",
          sides: [
            {
              connectionId: connId,
              entityKey: "Movie",
              keyPropertyKey: "title",
            },
          ],
        },
      });
      expect(concept.status()).toBe(201);
      conceptId = (await concept.json()).data.id;
    });
  });

  test.afterAll(async ({ browser }) => {
    await asAlice(browser, async (page) => {
      if (conceptId) {
        await page.request.delete(`/api/ontology/concepts/${conceptId}`);
      }
      if (connId) {
        await page.request.delete(`/api/connections/${connId}?force=true`);
      }
    });
  });

  test("export, change a description, import with the mapping: the original is back", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.goto("/model");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const path = await (await download).path();
    exported = await readFile(path, "utf8");
    expect(JSON.parse(exported)).toMatchObject({
      format: "neoboard-ontology",
      version: 1,
    });
    expect(exported).toContain(conceptName);

    expect((await describeMovie(page, "Changed")).ok()).toBeTruthy();
    expect(await movieDescription(page)).toBe("Changed");

    await page.getByRole("button", { name: "Import", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "neoboard-model.json",
      mimeType: "application/json",
      buffer: Buffer.from(exported),
    });
    // Prefilled by name: the connection's choice is itself.
    await expect(dialog.getByLabel(connName, { exact: true })).toHaveValue(
      connId,
    );
    await dialog.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(dialog.getByTestId("import-counts")).toBeVisible();
    await expect(
      dialog.getByText(`${connName}: entity Movie`, { exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect.poll(() => movieDescription(page)).toBe("Original");
  });

  test("a reader can export but not import", async ({ authPage, page }) => {
    await authPage.login(CAROL.email, CAROL.password);
    await page.goto("/model");
    await expect(
      page.getByRole("button", { name: "Export", exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: "Import", exact: true }),
    ).toHaveCount(0);
  });
});
