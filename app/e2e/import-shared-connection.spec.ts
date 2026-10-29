import { test, expect, ALICE, TEST_PG_PORT, uid } from "./fixtures";
import { AuthPage } from "./pages/auth";
import type { Browser, Page } from "@playwright/test";

/**
 * #2327: a creator imports a dashboard onto a connection an admin shared,
 * the one connection a creator can use that is not their own.
 */
test.describe("Dashboard import onto a shared connection (#2327)", () => {
  let connectionId = "";
  let userId = "";
  let importedId = "";
  const suffix = uid();
  const connectionName = `import-shared-${suffix}`;
  const creator = {
    email: `import-creator-${suffix}@example.com`,
    password: "password123",
  };

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
      const userRes = await page.request.post("/api/users", {
        data: { name: `Importer ${suffix}`, ...creator, role: "creator" },
      });
      expect(userRes.status()).toBe(201);
      userId = (await userRes.json()).data.id;
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
      const shareRes = await page.request.patch(
        `/api/connections/${connectionId}`,
        { data: { visibility: "shared" } },
      );
      expect(shareRes.ok()).toBeTruthy();
    });
  });

  test.afterAll(async ({ browser }) => {
    await asAlice(browser, async (page) => {
      if (importedId) {
        await page.request.delete(`/api/dashboards/${importedId}`);
      }
      if (connectionId) {
        await page.request.delete(
          `/api/connections/${connectionId}?force=true`,
        );
      }
      if (userId) await page.request.delete(`/api/users/${userId}`);
    });
  });

  test("a creator maps the file's connection onto a shared one and the widget runs", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(60_000);
    await authPage.login(creator.email, creator.password);
    const file = {
      formatVersion: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      dashboard: { name: `Imported ${suffix}`, description: null },
      connections: { conn_0: { name: "Relational DB", type: "postgresql" } },
      layout: {
        version: 2,
        pages: [
          {
            id: "p1",
            title: "Page 1",
            widgets: [
              {
                id: "w1",
                chartType: "table",
                connectionId: "conn_0",
                query: "SELECT 'shared-ok' AS probe",
                settings: { title: "Shared widget" },
              },
            ],
            gridLayout: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
          },
        ],
      },
    };

    await page.getByRole("button", { name: "Import", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Import Dashboard",
      exact: true,
    });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await dialog.locator("#import-file").setInputFiles({
      name: "shared.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(file)),
    });
    await dialog.locator("button[role='combobox']").click();
    await page
      .getByRole("option", { name: connectionName, exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Import", exact: true })
      .last()
      .click();

    await page
      .getByRole("button", { name: "View dashboard", exact: true })
      .click({ timeout: 15_000 });
    await page.waitForURL(/\/[\w-]+$/, { timeout: 15_000 });
    importedId = page.url().split("/").pop() ?? "";
    await expect(page.getByText("shared-ok", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
