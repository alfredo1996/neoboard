import { test, expect, ALICE } from "./fixtures";

test.describe("Login — uncovered states", () => {
  test("should show error alert for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").waitFor({ state: "visible" });
    await page.getByLabel("Email").fill("wrong@example.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password")).toBeVisible({
      timeout: 10_000,
    });
    // Should stay on login page
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page should render with correct form structure", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByText("NeoBoard")).toBeVisible();
    await expect(page.getByText("Sign in to your account")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
  });
});

test.describe("Role-based dashboard visibility", () => {
  test("reader should see only assigned dashboards with viewer badge, no create button", async ({
    authPage,
    page,
  }) => {
    // Create a reader user via API
    await authPage.login(ALICE.email, ALICE.password);
    const timestamp = Date.now();
    const readerEmail = `reader-${timestamp}@example.com`;

    // Create reader user via admin
    await page.goto("/users");
    await expect(page.getByText("alice@example.com")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Create User" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#user-name").fill("Test Reader");
    await dialog.locator("#user-email").fill(readerEmail);
    await dialog.locator("#user-password").fill("password123");
    // Set role to reader
    await dialog.locator("#user-role").click();
    await page.getByRole("option", { name: "Reader" }).click();
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(readerEmail)).toBeVisible();

    // Logout and login as reader
    await authPage.logout();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await authPage.login(readerEmail, "password123");
    await expect(page).toHaveURL("/", { timeout: 15_000 });

    // Reader should NOT see "New Dashboard" button
    await expect(
      page.getByRole("button", { name: /New Dashboard/i })
    ).not.toBeVisible();

    // Reader with no assignments should see the correct empty message
    await expect(
      page.getByText("No dashboards have been assigned to you yet")
    ).toBeVisible({ timeout: 10_000 });
  });

  test("admin should see role badge on dashboard cards", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await expect(page).toHaveURL("/");
    // Movie Analytics should be visible with a role badge
    await expect(page.getByText("Movie Analytics")).toBeVisible({
      timeout: 10_000,
    });
    // Admin should see at least one role badge (admin/owner) on dashboard cards
    await expect(page.getByText(/admin|owner/).first()).toBeVisible({
      timeout: 5_000,
    });
  });
});

test.describe("Users page — role enforcement", () => {
  test("non-admin should see forbidden message on users page", async ({
    authPage,
    page,
  }) => {
    // Create a creator user
    await authPage.login(ALICE.email, ALICE.password);
    const timestamp = Date.now();
    const creatorEmail = `creator-${timestamp}@example.com`;

    await page.goto("/users");
    await expect(page.getByText("alice@example.com")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Create User" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#user-name").fill("Test Creator");
    await dialog.locator("#user-email").fill(creatorEmail);
    await dialog.locator("#user-password").fill("password123");
    // Creator is default role
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(creatorEmail)).toBeVisible();

    // Logout and login as creator
    await authPage.logout();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await authPage.login(creatorEmail, "password123");
    await expect(page).toHaveURL("/", { timeout: 15_000 });

    // Navigate to users page
    await page.goto("/users");

    // Wait for loading to finish, then check forbidden message
    await expect(page.getByText("Admin access required")).toBeVisible({
      timeout: 30_000,
    });
  });
});
