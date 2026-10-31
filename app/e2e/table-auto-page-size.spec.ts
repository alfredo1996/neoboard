import type { Page } from "@playwright/test";
import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  typeInEditor,
  saveDashboard,
  uid,
  editingCrumb,
} from "./fixtures";

/**
 * #2356 — a new table pages to fit its card (Auto), a typed Page Size wins,
 * and the saved widget carries no pageSize unless one was typed.
 */
const ROWS = "[data-testid='widget-card'] tbody tr";

type Layout = {
  pages: { gridLayout: { i: string; h: number }[]; widgets: unknown[] }[];
};

async function addTableWidget(page: Page, pageSize?: string) {
  await page
    .getByRole("button", { name: "Add Widget", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Add Widget", exact: true });
  await dialog
    .getByRole("combobox", { name: "Chart Type", exact: true })
    .click();
  await page.getByRole("option", { name: "Data Table", exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Connection", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Movies Graph (Neo4j) Neo4j", exact: true })
    .click();
  await typeInEditor(
    dialog,
    page,
    "UNWIND range(1, 60) AS n RETURN n AS number",
  );
  await expect(
    dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
  ).toBeEnabled({ timeout: 10_000 });
  await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
  await expect(dialog.locator("table").first()).toBeVisible({
    timeout: 15_000,
  });

  await dialog.getByRole("tab", { name: "Style", exact: true }).click();
  const field = dialog.locator("#pageSize");
  await expect(field).toHaveValue("");
  await expect(field).toHaveAttribute("placeholder", "Auto");
  if (pageSize) await field.fill(pageSize);

  await dialog.getByRole("button", { name: "Add Widget", exact: true }).click();
  await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  await saveDashboard(page);
}

async function setCardHeight(page: Page, id: string, h: number) {
  const res = await page.request.get(`/api/dashboards/${id}`);
  const { data } = (await res.json()) as { data: { layoutJson: Layout } };
  for (const g of data.layoutJson.pages[0].gridLayout) g.h = h;
  await page.request.put(`/api/dashboards/${id}`, {
    data: { layoutJson: data.layoutJson },
  });
}

async function savedChartOptions(page: Page, id: string) {
  const res = await page.request.get(`/api/dashboards/${id}`);
  const { data } = (await res.json()) as {
    data: {
      layoutJson: {
        pages: {
          widgets: { settings: { chartOptions: Record<string, unknown> } }[];
        }[];
      };
    };
  };
  return data.layoutJson.pages[0].widgets[0].settings.chartOptions;
}

test.describe("Table page size is Auto by default (#2356)", () => {
  let dashboardId = "";
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Auto page size ${uid()}`,
    );
    dashboardId = id;
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(editingCrumb(page)).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("a new table saves no pageSize and its page follows the card's height", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await addTableWidget(page);
    expect(await savedChartOptions(page, dashboardId)).not.toHaveProperty(
      "pageSize",
    );

    await setCardHeight(page, dashboardId, 16);
    await page.goto(`/${dashboardId}`);
    await expect(
      page.getByRole("button", { name: "Next", exact: true }),
    ).toBeVisible({
      timeout: 20_000,
    });
    const tall = await page.locator(ROWS).count();
    expect(tall).toBeGreaterThan(10);

    await setCardHeight(page, dashboardId, 8);
    await page.goto(`/${dashboardId}`);
    await expect(
      page.getByRole("button", { name: "Next", exact: true }),
    ).toBeVisible({
      timeout: 20_000,
    });
    const short = await page.locator(ROWS).count();
    expect(short).toBeGreaterThan(0);
    expect(short).toBeLessThan(tall);
  });

  test("a typed page size of 5 wins over the card's height", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await addTableWidget(page, "5");
    expect((await savedChartOptions(page, dashboardId)).pageSize).toBe(5);

    await setCardHeight(page, dashboardId, 16);
    await page.goto(`/${dashboardId}`);
    await expect(
      page.getByRole("button", { name: "Next", exact: true }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(ROWS)).toHaveCount(5);
  });
});
