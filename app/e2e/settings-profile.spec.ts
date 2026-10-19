import { test, expect, ALICE, uid } from "./fixtures";

test.describe("Settings — Profile", () => {
  test.beforeEach(async ({ authPage, sidebarPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await sidebarPage.navigateTo("Settings");
  });

  test("settings page shows Profile and API keys tabs", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Profile" })).toBeVisible();
    await expect(page.getByRole("button", { name: "API keys" })).toBeVisible();
  });

  test("sidebar navigates to profile by default", async ({ page }) => {
    await expect(page).toHaveURL(/\/settings\/profile/);
  });

  test("profile page shows account info", async ({ page }) => {
    await expect(page.getByText(ALICE.email, { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText(`Signed in as ${ALICE.email}`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Write access")).toBeVisible();
    await expect(page.getByText("Member since")).toBeVisible();
  });

  test("can update display name", async ({ page }) => {
    const nameInput = page.locator("#profile-name");
    await expect(nameInput).toBeVisible({ timeout: 10_000 });

    // Save the original name to restore later
    const originalName = await nameInput.inputValue();
    const newName = `Alice ${uid()}`;

    await nameInput.clear();
    await nameInput.fill(newName);
    await page.getByRole("button", { name: "Save name" }).click();

    // Verify the name was saved — button should become disabled (name matches profile)
    await expect(page.getByRole("button", { name: "Save name" })).toBeDisabled({
      timeout: 5_000,
    });

    // Restore original name
    await nameInput.clear();
    await nameInput.fill(originalName || "Alice");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByRole("button", { name: "Save name" })).toBeDisabled({
      timeout: 5_000,
    });
  });

  test("password change shows error for wrong current password", async ({
    page,
  }) => {
    await page.locator("#current-password").fill("wrongpassword");
    await page.locator("#new-password").fill("newpass123");
    await page.locator("#confirm-password").fill("newpass123");
    await page.getByRole("button", { name: "Change password" }).click();
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
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("New passwords do not match")).toBeVisible();
  });

  test("successful password change signs out and redirects to login (#1035)", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(45_000);
    // Use a throwaway signed-up user so the change doesn't invalidate ALICE's
    // password for the rest of the suite.
    const email = `pwchange-${uid()}@example.com`;
    const oldPw = "password123";
    const newPw = "newpass123456";
    await authPage.signup("PW Change User", email, oldPw);
    await expect(page).toHaveURL("/", { timeout: 15_000 });

    await page.goto("/settings/profile");
    await page.locator("#current-password").fill(oldPw);
    await page.locator("#new-password").fill(newPw);
    await page.locator("#confirm-password").fill(newPw);
    await page.getByRole("button", { name: "Change password" }).click();

    // Changing the password invalidates the session — the app sends the user
    // to a clean login with a clear message instead of stranding them on a
    // dead session that 401s the next request with a raw "Unauthorized".
    await expect(page).toHaveURL(/\/login\?passwordChanged=1/, {
      timeout: 15_000,
    });
    await expect(
      page.getByText(
        "Password changed. Please sign in with your new password.",
      ),
    ).toBeVisible();

    // The new password works; the user is back in cleanly.
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(newPw);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/", { timeout: 15_000 });
  });

  test("can switch to API keys tab", async ({ page }) => {
    await page.getByRole("button", { name: "API keys" }).click();
    await expect(page).toHaveURL(/\/settings\/api-keys/);
    await expect(
      page.getByRole("heading", { name: "API keys", exact: true }),
    ).toBeVisible();
  });
});

test.describe("Settings — Redirect", () => {
  test("navigating to /settings redirects to /settings/profile", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/settings\/profile/);
  });
});
