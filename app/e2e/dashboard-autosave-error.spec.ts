import { test, expect, ALICE, createTestDashboard } from "./fixtures";

test.describe("Dashboard auto-save error surfacing (issue #836)", () => {
  let dashboardId: string;
  let cleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup: c } = await createTestDashboard(
      page.request,
      `Autosave Error Test ${Date.now()}`,
    );
    dashboardId = id;
    cleanup = c;
  });

  test.afterEach(async () => {
    await cleanup?.();
  });

  test("shows sticky toast on save failure and dismisses it on next success", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    let stubMode: "fail" | "pass" = "fail";

    // Intercept PUT /api/dashboards/:id and toggle between 500 and the real handler
    await page.route(`**/api/dashboards/${dashboardId}`, async (route) => {
      if (route.request().method() !== "PUT") {
        return route.fallback();
      }
      if (stubMode === "fail") {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "boom" }),
        });
      }
      return route.fallback();
    });

    await page.goto(`/${dashboardId}`);

    // Open auto-refresh dropdown and pick 30s — this triggers an auto-save
    await page
      .getByRole("button", { name: /Auto-refresh|RefreshCw|30s|1m/i })
      .first()
      .click();
    await page.getByRole("menuitemradio", { name: "30 seconds" }).click();

    // Sticky destructive toast should appear with the 5xx classification
    await expect(
      page.getByText("Server error — your change wasn't saved.", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 5_000 });

    // Flip stub to pass-through so the next save succeeds
    stubMode = "pass";

    // Trigger another save by changing the interval again
    await page
      .getByRole("button", { name: /Auto-refresh|30s|1m/i })
      .first()
      .click();
    await page.getByRole("menuitemradio", { name: "1 minute" }).click();

    // Toast should disappear after the successful save
    await expect(
      page.getByText("Server error — your change wasn't saved.", {
        exact: true,
      }),
    ).not.toBeVisible({ timeout: 10_000 });
  });
});
