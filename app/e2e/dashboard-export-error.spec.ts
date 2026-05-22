import { test, expect, ALICE, createTestDashboard } from "./fixtures";

test.describe("Dashboard export error surfacing (issue #835)", () => {
  let dashboardName: string;
  let cleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    dashboardName = `Export Failure Test ${Date.now()}`;
    const { cleanup: c } = await createTestDashboard(
      page.request,
      dashboardName,
    );
    cleanup = c;
  });

  test.afterEach(async () => {
    await cleanup?.();
  });

  test("shows destructive toast when export API returns 500", async ({
    page,
  }) => {
    test.setTimeout(45_000);

    // Stub the export endpoint to fail with 500 so the catch path fires
    await page.route("**/api/dashboards/*/export", (route) =>
      route.fulfill({ status: 500, body: "boom" }),
    );

    await page.goto("/dashboards");

    // Find the dashboard card by its name, then open its options menu
    const card = page
      .locator("[data-testid='dashboard-card']")
      .filter({ hasText: dashboardName });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByRole("button", { name: "Dashboard options" }).click();
    await page.getByRole("menuitem", { name: "Export" }).click();

    // Classified toast for 5xx
    await expect(
      page.getByText("Server error — please try again.", { exact: true }),
    ).toBeVisible({ timeout: 5_000 });
  });
});
