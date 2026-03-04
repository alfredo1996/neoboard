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

test.describe("can_write toggle", () => {
  /** Helper: create a fresh creator user and return their email. */
  async function createCreator(page: import("@playwright/test").Page, label: string) {
    const email = `${label}-${Date.now()}@example.com`;
    await expect(page.getByText("alice@example.com")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Create User" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#user-name").fill("Test Creator");
    await dialog.locator("#user-email").fill(email);
    await dialog.locator("#user-password").fill("password123");
    // Creator is the default role — no change needed
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(email)).toBeVisible({ timeout: 10_000 });
    return email;
  }

  test.beforeEach(async ({ authPage, sidebarPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await sidebarPage.navigateTo("Users");
  });

  test("Write column shows Yes badge for creators by default", async ({ page }) => {
    const email = await createCreator(page, "badge-test");
    const row = page.getByRole("row").filter({ hasText: email });
    // Admin sees a Switch in the Write column; checked = canWrite enabled
    await expect(row.getByRole("switch")).toBeChecked();
  });

  test("admin can toggle can_write off for a creator", async ({ page }) => {
    const email = await createCreator(page, "toggle-off");
    const row = page.getByRole("row").filter({ hasText: email });

    // Default: write enabled (switch checked)
    await expect(row.getByRole("switch")).toBeChecked();

    // Toggle off
    await row.getByRole("switch").click();
    await expect(row.getByRole("switch")).not.toBeChecked({ timeout: 5_000 });
  });

  test("admin can toggle can_write back on after disabling", async ({ page }) => {
    const email = await createCreator(page, "toggle-on");
    const row = page.getByRole("row").filter({ hasText: email });

    // Disable first
    await row.getByRole("switch").click();
    await expect(row.getByRole("switch")).not.toBeChecked({ timeout: 5_000 });

    // Re-enable
    await row.getByRole("switch").click();
    await expect(row.getByRole("switch")).toBeChecked({ timeout: 5_000 });
  });

  test("Write switch is disabled for the admin's own row", async ({ page }) => {
    await expect(page.getByText("alice@example.com")).toBeVisible({ timeout: 10_000 });
    const aliceRow = page.getByRole("row").filter({ hasText: "alice@example.com" });
    // Own row: switch is wrapped in a disabled span (cursor-not-allowed)
    await expect(aliceRow.getByRole("switch")).toBeDisabled();
  });

  test("Write switch is disabled for reader-role users", async ({ page }) => {
    const email = `reader-nowrite-${Date.now()}@example.com`;
    await expect(page.getByText("alice@example.com")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Create User" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#user-name").fill("Test Reader");
    await dialog.locator("#user-email").fill(email);
    await dialog.locator("#user-password").fill("password123");
    await dialog.locator("#user-role").click();
    await page.getByRole("option", { name: "Reader" }).click();
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(email)).toBeVisible({ timeout: 10_000 });

    const row = page.getByRole("row").filter({ hasText: email });
    // Reader always shows No and the switch is disabled
    await expect(row.getByText("No")).toBeVisible();
    await expect(row.getByRole("switch")).toBeDisabled();
  });
});
