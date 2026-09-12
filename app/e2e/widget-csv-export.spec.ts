import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect, ALICE, createTestDashboard } from "./fixtures";

/**
 * #1809 — Export CSV looked the widget's result up by a cache key prefix that
 * had matched nothing since `database` joined the key, so it downloaded no
 * file at all. Reading the first prefix match instead would export the
 * previous parameter's rows, so this also changes the parameter and checks
 * the second file.
 */
test.describe("Widget Export CSV (#1809)", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  async function exportCsv(page: Page): Promise<string> {
    const card = page
      .locator("[data-testid='widget-card']")
      .filter({ has: page.locator("table") });
    await card.hover();
    await card.getByRole("button", { name: "Widget actions" }).click();
    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
    await page.getByRole("menuitem", { name: "Export CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    return readFile((await download.path())!, "utf8");
  }

  test("downloads the rows the widget shows, and the new rows after a parameter change", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const { id, cleanup } = await createTestDashboard(
      page.request,
      `CSV export ${Date.now()}`,
    );

    try {
      const put = await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [
              {
                id: "p1",
                title: "Page 1",
                widgets: [
                  {
                    id: "sel",
                    chartType: "parameter-select",
                    connectionId: "conn-neo4j-001",
                    query: "",
                    settings: {
                      title: "Movie",
                      chartOptions: {
                        parameterName: "movie",
                        parameterType: "text",
                        defaultValue: "The Matrix",
                      },
                    },
                  },
                  {
                    id: "tbl",
                    chartType: "table",
                    connectionId: "conn-neo4j-001",
                    query:
                      "MATCH (m:Movie) WHERE m.title = $param_movie RETURN m.title AS title",
                    settings: { title: "Chosen movie" },
                  },
                ],
                gridLayout: [
                  { i: "sel", x: 0, y: 0, w: 4, h: 3 },
                  { i: "tbl", x: 4, y: 0, w: 8, h: 4 },
                ],
              },
            ],
          },
        },
      });
      expect(put.ok()).toBe(true);

      await page.goto(`/${id}`);
      const table = page.locator("table").first();
      await expect(table).toContainText("The Matrix", { timeout: 20_000 });

      const first = await exportCsv(page);
      expect(first).toContain("title");
      expect(first).toContain("The Matrix");

      // Change the parameter; the first variant stays in the query cache.
      await page.keyboard.press("Escape");
      await page.locator("#param-text-movie").fill("Top Gun");
      await expect(table).toContainText("Top Gun", { timeout: 20_000 });
      await expect(table).not.toContainText("The Matrix");

      const second = await exportCsv(page);
      expect(second).toContain("Top Gun");
      expect(second).not.toContain("The Matrix");
    } finally {
      await cleanup();
    }
  });
});
