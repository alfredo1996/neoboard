import { test, expect, ALICE } from "./fixtures";

test.describe("Authentication", () => {
  test("should redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
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

test.describe("Signup", () => {
  test("should render signup form with all required fields", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByText("Create your account")).toBeVisible();
    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("should create account and auto-login", async ({ authPage, page }) => {
    const email = `signup-${Date.now()}@example.com`;
    await authPage.signup("Signup Test User", email, "password123");
    // Signup should auto-login and redirect to the dashboard
    await expect(page).toHaveURL("/", { timeout: 15_000 });
    // Sidebar should be visible (proves we're authenticated)
    await expect(page.getByRole("button", { name: "Dashboards" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("should be able to login with newly created account", async ({ authPage, page }) => {
    const email = `relogin-${Date.now()}@example.com`;
    const password = "password123";
    // Sign up
    await authPage.signup("Relogin User", email, password);
    await expect(page).toHaveURL("/", { timeout: 15_000 });
    // Log out
    await authPage.logout();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    // Log back in with the new account
    await authPage.login(email, password);
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("button", { name: "Dashboards" })).toBeVisible({ timeout: 10_000 });
  });

  test("should show error for mismatched passwords", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Name").fill("Mismatch User");
    await page.getByLabel("Email").fill(`mismatch-${Date.now()}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByLabel("Confirm Password").fill("differentpass");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Passwords do not match")).toBeVisible();
    // Should stay on signup page
    await expect(page).toHaveURL(/\/signup/);
  });

  test("should show error for duplicate email", async ({ page, authPage }) => {
    // ALICE is seeded — trying to sign up with her email should fail
    await page.goto("/signup");
    await page.getByLabel("Name").fill("Duplicate User");
    await page.getByLabel("Email").fill(ALICE.email);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByLabel("Confirm Password").fill("password123");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("An account with this email already exists")).toBeVisible({ timeout: 10_000 });
    // Should stay on signup page
    await expect(page).toHaveURL(/\/signup/);
  });

  test("should navigate to login page via link", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
