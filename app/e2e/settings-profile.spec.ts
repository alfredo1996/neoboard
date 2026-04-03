import { test, expect, ALICE } from "./fixtures";

test.describe("Settings — Profile", () => {
  test.beforeEach(async ({ authPage, sidebarPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await sidebarPage.navigateTo("Settings");
  });

  test("settings page shows Profile and API Keys tabs", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Profile" })).toBeVisible();
    await expect(page.getByRole("button", { name: "API Keys" })).toBeVisible();
  });

  test("sidebar navigates to profile by default", async ({ page }) => {
    await expect(page).toHaveURL(/\/settings\/profile/);
  });

  test("profile page shows account info", async ({ page }) => {
    await expect(page.getByText("Account", { exact: true })).toBeVisible();
    await expect(page.getByText(ALICE.email)).toBeVisible();
    // Role badge — use locator scoped to avoid matching sidebar/other elements
    await expect(page.locator("[data-slot='badge']").first()).toBeVisible();
  });

  test("can update display name", async ({ page }) => {
    const nameInput = page.locator("#profile-name");
    await expect(nameInput).toBeVisible({ timeout: 10_000 });

    // Save the original name to restore later
    const originalName = await nameInput.inputValue();
    const newName = `Alice ${Date.now()}`;

    await nameInput.clear();
    await nameInput.fill(newName);
    await page.getByRole("button", { name: "Save" }).click();

    // Verify the name was saved — button should become disabled (name matches profile)
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled({
      timeout: 5_000,
    });

    // Restore original name
    await nameInput.clear();
    await nameInput.fill(originalName || "Alice");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled({
      timeout: 5_000,
    });
  });

  test("password change shows error for wrong current password", async ({
    page,
  }) => {
    await page.locator("#current-password").fill("wrongpassword");
    await page.locator("#new-password").fill("newpass123");
    await page.locator("#confirm-password").fill("newpass123");
    await page.getByRole("button", { name: "Change Password" }).click();
    await expect(page.getByText("Current password is incorrect")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("password change shows error for mismatched passwords", async ({
    page,
  }) => {
    await page.locator("#current-password").fill(ALICE.password);
    await page.locator("#new-password").fill("newpass123");
    await page.locator("#confirm-password").fill("different123");
    await page.getByRole("button", { name: "Change Password" }).click();
    await expect(page.getByText("New passwords do not match")).toBeVisible();
  });

  test("successful password change shows success and keeps user logged in", async ({
    page,
  }) => {
    const tempPassword = "tempPass999";

    // Change to temporary password
    await page.locator("#current-password").fill(ALICE.password);
    await page.locator("#new-password").fill(tempPassword);
    await page.locator("#confirm-password").fill(tempPassword);
    await page.getByRole("button", { name: "Change Password" }).click();
    await expect(page.getByText("Password changed successfully")).toBeVisible({
      timeout: 5_000,
    });

    // User should still be on the settings page (not kicked out)
    await expect(page).toHaveURL(/\/settings\/profile/);
    await expect(page.getByText("Account", { exact: true })).toBeVisible();

    // Change back to original password
    await page.locator("#current-password").fill(tempPassword);
    await page.locator("#new-password").fill(ALICE.password);
    await page.locator("#confirm-password").fill(ALICE.password);
    await page.getByRole("button", { name: "Change Password" }).click();
    await expect(page.getByText("Password changed successfully")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("can switch to API Keys tab", async ({ page }) => {
    await page.getByRole("button", { name: "API Keys" }).click();
    await expect(page).toHaveURL(/\/settings\/api-keys/);
    await expect(
      page.getByRole("heading", { name: "API Keys", exact: true }),
    ).toBeVisible();
  });
});
