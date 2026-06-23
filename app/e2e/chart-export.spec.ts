import { test, expect, ALICE } from "./fixtures";

test.describe("Chart export actions (issue #872)", () => {
  test("ECharts widget exposes Export PNG + Export SVG and PNG downloads", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(60_000);
    await authPage.login(ALICE.email, ALICE.password);

    // Movie Analytics seeded dashboard — first widget is a bar chart (ECharts)
    const res = await page.request.get("/api/dashboards");
    const dashboards = (await res.json()).data as {
      id: string;
      name: string;
    }[];
    const movieAnalytics = dashboards.find((d) => d.name === "Movie Analytics");
    expect(movieAnalytics).toBeTruthy();
    await page.goto(`/${movieAnalytics!.id}`);

    // Find the first ECharts widget — one whose card contains a base-chart element
    const echartsCard = page
      .locator("[data-testid='widget-card']")
      .filter({ has: page.locator("[data-testid='base-chart']") })
      .first();
    await expect(echartsCard).toBeVisible({ timeout: 15_000 });
    await echartsCard.hover();
    await echartsCard.getByRole("button", { name: "Widget actions" }).click();

    // #912: Export formats now live inside an "Export ▸" submenu.
    // Open the submenu via the parent menuitem.
    const exportTrigger = page.getByRole("menuitem", { name: "Export" });
    await expect(exportTrigger).toBeVisible();
    await exportTrigger.hover();

    // Both formats render as children of the submenu
    await expect(page.getByRole("menuitem", { name: "PNG" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "SVG" })).toBeVisible();

    // Clicking PNG triggers a .png download
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "PNG" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.png$/);
  });
});
