import { test, expect, ALICE } from "./fixtures";

test.describe("Authentication", () => {
  test("should redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("should sign up a new account", async ({ authPage, page }) => {
    const email = `test-${Date.now()}@example.com`;
    await authPage.signup("Test User", email, "password123");
    // Signup auto-logs in and redirects to /
    await expect(page).toHaveURL("/", { timeout: 15_000 });
  });

  test("should log in with existing account", async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await expect(page).toHaveURL("/");
  });

  test("should log out via sidebar", async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await expect(page).toHaveURL("/");
    await authPage.logout();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
