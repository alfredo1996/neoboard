import { test, expect, ALICE } from "./fixtures";

test.describe("Dashboard CRUD", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("should create a new dashboard", async ({ page }) => {
    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const dialog = page.getByRole("dialog");
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
    await page.waitForURL(/\/edit$/, { timeout: 15_000 });
    await expect(page.getByText("Editing:")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Widget" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("should delete a dashboard", async ({ page }) => {
    // Create one to delete
    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#dashboard-name").fill("To Delete Dashboard");
    await dialog.getByRole("button", { name: "Create" }).click();
    // After creation, app navigates to edit page — go back to list
    await page.waitForURL(/\/edit/, { timeout: 10000 });
    await page.goto("/");
    await expect(page.getByText("To Delete Dashboard")).toBeVisible({ timeout: 10000 });

    // Find the card containing the text and click its Delete button
    const card = page.locator("div[class*='border']")
      .filter({ hasText: "To Delete Dashboard" })
      .filter({ has: page.getByRole("button", { name: /delete/i }) });
    await card.getByRole("button", { name: /delete/i }).click();
    // Confirm deletion
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("To Delete Dashboard")).not.toBeVisible();
  });
});
