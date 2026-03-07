import { test, expect, ALICE } from "./fixtures";

test.describe("Dashboard CRUD", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("should create a new dashboard", async ({ page }) => {
    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const dialog = page.getByRole("dialog", { name: "Create Dashboard" });
    await dialog.locator("#dashboard-name").fill("E2E Test Dashboard");
    await dialog.getByRole("button", { name: "Create" }).click();
    // After creation, app navigates to edit page
    await expect(page.getByText("E2E Test Dashboard")).toBeVisible({ timeout: 10000 });
  });

  test("should open dashboard in view mode", async ({ page }) => {
    await page.getByText("Movie Analytics").click();
    // Wait for navigation to the dashboard view page
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10000 });
    await expect(page.getByText("Movie Analytics")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  });

  test("should open dashboard in edit mode", async ({ page }) => {
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.waitForURL(/\/edit/, { timeout: 15_000 });
    await expect(page.getByText("Editing:")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Widget" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("should delete a dashboard", async ({ page }) => {
    // Create one to delete
    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const dialog = page.getByRole("dialog", { name: "Create Dashboard" });
    await dialog.locator("#dashboard-name").fill("To Delete Dashboard");
    await dialog.getByRole("button", { name: "Create" }).click();
    // After creation, app navigates to edit page — go back to list
    await page.waitForURL(/\/edit/, { timeout: 10000 });
    await page.goto("/");
    await expect(page.getByText("To Delete Dashboard")).toBeVisible({ timeout: 10000 });

    // Open the dashboard options dropdown (Delete is inside a DropdownMenu)
    const dashCard = page.locator("div[class*='cursor-pointer']")
      .filter({ hasText: "To Delete Dashboard" })
      .first();
    await expect(dashCard.getByRole("button", { name: "Dashboard options" })).toBeVisible({ timeout: 5_000 });
    await dashCard.getByRole("button", { name: "Dashboard options" }).click();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible({ timeout: 5_000 });
    await page.getByRole("menuitem", { name: "Delete" }).click();
    // Confirm deletion in the confirmation dialog
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("To Delete Dashboard")).not.toBeVisible();
  });

  test("should duplicate a dashboard via card dropdown", async ({ page }) => {
    // Find the "Movie Analytics" card and open its dropdown
    const dashCard = page
      .locator("div[class*='cursor-pointer']")
      .filter({ hasText: "Movie Analytics" })
      .first();
    await expect(dashCard).toBeVisible({ timeout: 10_000 });
    await dashCard.getByRole("button", { name: "Dashboard options" }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();

    // A copy card should appear
    await expect(page.getByText("Movie Analytics (copy)")).toBeVisible({ timeout: 15_000 });
    // Original should still be visible
    await expect(page.getByText("Movie Analytics").first()).toBeVisible();

    // Clean up — delete the copy to avoid polluting other tests
    const copyCard = page
      .locator("div[class*='cursor-pointer']")
      .filter({ hasText: "Movie Analytics (copy)" })
      .first();
    await copyCard.getByRole("button", { name: "Dashboard options" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Movie Analytics (copy)")).not.toBeVisible({ timeout: 5_000 });
  });
});
