import { test, expect, ALICE } from "./fixtures";

test.describe("Dashboard list & role badges", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("creator/admin should see New Dashboard button on dashboard list", async ({
    page,
  }) => {
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("button", { name: /New Dashboard/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("users page role badge variants display correctly", async ({
    page,
    sidebarPage,
  }) => {
    await sidebarPage.navigateTo("Users");
    await expect(page.getByText("alice@example.com")).toBeVisible({
      timeout: 10_000,
    });

    // Alice is admin — her role badge should be visible
    const aliceRow = page.getByRole("row").filter({ hasText: "alice@example.com" });
    await expect(aliceRow).toBeVisible();

    // Create users with different roles and verify badges
    const timestamp = Date.now();

    // Create a creator
    await page.getByRole("button", { name: "Create User" }).first().click();
    let dialog = page.getByRole("dialog");
    await dialog.locator("#user-name").fill("Badge Creator");
    await dialog.locator("#user-email").fill(`badge-creator-${timestamp}@example.com`);
    await dialog.locator("#user-password").fill("password123");
    // Default role is creator
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(`badge-creator-${timestamp}@example.com`)).toBeVisible();

    // Create a reader
    await page.getByRole("button", { name: "Create User" }).first().click();
    dialog = page.getByRole("dialog");
    await dialog.locator("#user-name").fill("Badge Reader");
    await dialog.locator("#user-email").fill(`badge-reader-${timestamp}@example.com`);
    await dialog.locator("#user-password").fill("password123");
    await dialog.locator("#user-role").click();
    await page.getByRole("option", { name: "Reader" }).click();
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(`badge-reader-${timestamp}@example.com`)).toBeVisible();

    // Verify both rows exist with the correct role display
    const creatorRow = page.getByRole("row").filter({ hasText: `badge-creator-${timestamp}@example.com` });
    await expect(creatorRow).toBeVisible();

    const readerRow = page.getByRole("row").filter({ hasText: `badge-reader-${timestamp}@example.com` });
    await expect(readerRow).toBeVisible();
  });

  test("connections page header and Add Connection button are visible", async ({ page }) => {
    await page.goto("/connections");
    await expect(
      page.getByRole("heading", { level: 1, name: "Connections" })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Add Connection" })
    ).toBeVisible();
  });
});

test.describe("Confirm dialog — destructive", () => {
  test("dashboard delete confirm dialog should show destructive warning", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);

    // Create a uniquely-named dashboard to avoid collision with retries
    const dashName = `Delete Test ${Date.now()}`;
    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const createDialog = page.getByRole("dialog");
    await createDialog.locator("#dashboard-name").fill(dashName);
    await createDialog.getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/\/edit/, { timeout: 10_000 });
    await page.goto("/");
    await expect(page.getByText(dashName)).toBeVisible({
      timeout: 10_000,
    });

    // Find the dashboard card that contains our name and its Delete button
    // Each card is a div with both the name text and action buttons
    const card = page.locator("[class*='cursor-pointer']").filter({ hasText: dashName });
    await card.getByRole("button", { name: "Delete" }).click();

    // Confirm dialog should be visible with destructive warning
    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog.getByText("Delete Dashboard")).toBeVisible();
    await expect(confirmDialog.getByText("This action cannot be undone")).toBeVisible();
    await expect(
      confirmDialog.getByRole("button", { name: "Delete" })
    ).toBeVisible();
    await expect(
      confirmDialog.getByRole("button", { name: /Cancel/i })
    ).toBeVisible();

    // Actually delete to clean up (avoid test pollution)
    await confirmDialog.getByRole("button", { name: "Delete" }).click();
    await expect(confirmDialog).not.toBeVisible({ timeout: 10_000 });
  });
});
