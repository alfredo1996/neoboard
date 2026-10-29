import { test, expect, ALICE } from "./fixtures";

test.describe("Chart export actions (issue #872)", () => {
  test("ECharts widget exposes Export PNG + Export SVG and PNG downloads", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(60_000);
    await authPage.login(ALICE.email, ALICE.password);

    // Movie Analytics seeded dashboard — two chart widgets (ECharts)
    const res = await page.request.get("/api/dashboards");
    const dashboards = (await res.json()).data as {
      id: string;
      name: string;
    }[];
    const movieAnalytics = dashboards.find((d) => d.name === "Movie Analytics");
    expect(movieAnalytics).toBeTruthy();
    await page.goto(`/${movieAnalytics!.id}`);

    // Wait for both charts: otherwise .first() picks whichever renders first,
    // and under load that is the right-hand card (#1470).
    await expect(page.locator("[data-testid='base-chart']")).toHaveCount(2, {
      timeout: 15_000,
    });
    // First ECharts widget in DOM order — the left-hand one
    const echartsCard = page
      .locator("[data-testid='widget-card']")
      .filter({ has: page.locator("[data-testid='base-chart']") })
      .first();
    await expect(echartsCard).toBeVisible({ timeout: 15_000 });
    await echartsCard.hover();
    await echartsCard.getByRole("button", { name: "Widget actions" }).click();

    // #912: Export formats now live inside an "Export ▸" submenu.
    // Open it from the keyboard (#1470). Radix flips the submenu to the left
    // on a card at the viewport's right edge, but its pointer direction starts
    // as "right"; Playwright's jump from "..." to Export never corrects it, so
    // leaving the trigger for PNG moves focus to the root menu and closes the
    // submenu. A real, continuous mouse path does not hit this.
    const exportTrigger = page.getByRole("menuitem", { name: "Export" });
    await expect(exportTrigger).toBeVisible();
    await exportTrigger.focus();
    await page.keyboard.press("ArrowRight");

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
