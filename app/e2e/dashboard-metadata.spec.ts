import { test, expect, ALICE } from "./fixtures";

test.describe("Dashboard metadata — updatedBy display", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("card footer shows 'by {name}' for seeded dashboard", async ({ page }) => {
    // The seeded "Movie Analytics" dashboard has updated_by = user-alice-001
    const card = page
      .locator("div[class*='cursor-pointer']")
      .filter({ hasText: "Movie Analytics" })
      .first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Card should contain "by Alice Demo" in the footer area
    await expect(card.getByText("by Alice Demo")).toBeVisible();
  });

  test("card footer shows 'by {name}' after creating a dashboard", async ({ page }) => {
    const dashboardName = `Metadata E2E Test ${Date.now()}`;

    // Create a new dashboard with a unique name
    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const dialog = page.getByRole("dialog", { name: "Create Dashboard" });
    await dialog.locator("#dashboard-name").fill(dashboardName);
    await dialog.getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/\/edit/, { timeout: 10_000 });

    // Go back to list
    await page.goto("/");
    const card = page
      .locator("div[class*='cursor-pointer']")
      .filter({ hasText: dashboardName })
      .first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Card should show "by Alice Demo" since Alice created it
    await expect(card.getByText("by Alice Demo")).toBeVisible();

    // Clean up
    await card.getByRole("button", { name: "Dashboard options" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(dashboardName)).not.toBeVisible({ timeout: 5_000 });
  });

  test("viewer toolbar shows 'updated ... by {name}'", async ({ page }) => {
    // Navigate to seeded dashboard
    await page.getByText("Movie Analytics", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // Toolbar should contain "by Alice Demo"
    await expect(page.getByText("by Alice Demo")).toBeVisible({ timeout: 10_000 });
  });
});
