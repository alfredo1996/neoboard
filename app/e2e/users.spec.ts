import { test, expect, ALICE } from "./fixtures";

test.describe("User management", () => {
  test.beforeEach(async ({ authPage, sidebarPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await sidebarPage.navigateTo("Users");
  });

  test("should show users page with current users", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
    // Should show at least the seeded users
    await expect(page.getByText("alice@example.com")).toBeVisible();
  });

  test("should create a new user", async ({ page }) => {
    // Wait for user data to load (avoids duplicate "Create User" buttons from EmptyState)
    await expect(page.getByText("alice@example.com")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Create User" }).first().click();
    const dialog = page.getByRole("dialog");
    const timestamp = Date.now();
    await dialog.locator("#user-name").fill("Test User");
    await dialog.locator("#user-email").fill(`test-${timestamp}@example.com`);
    await dialog.locator("#user-password").fill("password123");
    await dialog.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText(`test-${timestamp}@example.com`)).toBeVisible();
  });

  test("should delete a user with confirmation", async ({ page }) => {
    // Wait for user data to load
    await expect(page.getByText("alice@example.com")).toBeVisible({ timeout: 10000 });
    // Create a user to delete
    await page.getByRole("button", { name: "Create User" }).first().click();
    const dialog = page.getByRole("dialog");
    const timestamp = Date.now();
    const email = `delete-${timestamp}@example.com`;
    await dialog.locator("#user-name").fill("To Delete");
    await dialog.locator("#user-email").fill(email);
    await dialog.locator("#user-password").fill("password123");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(email)).toBeVisible();

    // Find the row and click delete
    const row = page.getByRole("row").filter({ hasText: email });
    await row.getByRole("button", { name: "Delete" }).click();
    // Confirm deletion in the confirm dialog
    await page.getByRole("button", { name: "Delete" }).last().click();
    await expect(page.getByText(email)).not.toBeVisible();
  });
});
