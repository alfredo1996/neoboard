import { test, expect, ALICE } from "./fixtures";

/**
 * SSO E2E tests — full OIDC flow against a Keycloak test container.
 *
 * Prerequisites (handled by global-setup.ts):
 * - Keycloak container running with neoboard-test realm
 * - SSO provider "Keycloak Test" seeded in sso_providers table
 * - Test users in Keycloak: sso-admin, sso-editor, sso-viewer, sso-nogroup
 */

test.describe("SSO — OIDC login flow", () => {
  test("login page shows SSO button when provider is configured", async ({
    page,
  }) => {
    await page.goto("/login", { waitUntil: "networkidle" });

    // The seeded "Keycloak Test" provider should appear as a button
    const ssoButton = page.getByRole("button", {
      name: "Sign in with Keycloak Test",
    });
    await expect(ssoButton).toBeVisible({ timeout: 10_000 });

    // Password form should still be visible (enforce_sso is false)
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("SSO button redirects to Keycloak login page", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });

    const ssoButton = page.getByRole("button", {
      name: "Sign in with Keycloak Test",
    });
    await expect(ssoButton).toBeVisible({ timeout: 10_000 });

    // Click SSO button — should redirect to Keycloak
    await ssoButton.click();

    // Wait for Keycloak login page to load
    await expect(page).toHaveURL(/\/realms\/neoboard-test\//, {
      timeout: 15_000,
    });

    // Keycloak login form should be visible
    await expect(page.locator("#username")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#password")).toBeVisible();
  });

  test("full SSO login flow with Keycloak user (auto-provision)", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.goto("/login", { waitUntil: "networkidle" });

    // Click SSO button
    const ssoButton = page.getByRole("button", {
      name: "Sign in with Keycloak Test",
    });
    await expect(ssoButton).toBeVisible({ timeout: 10_000 });
    await ssoButton.click();

    // Wait for Keycloak login page
    await expect(page).toHaveURL(/\/realms\/neoboard-test\//, {
      timeout: 15_000,
    });

    // Log in as the editor user on Keycloak
    await page.locator("#username").fill("sso-editor");
    await page.locator("#password").fill("password123");
    await page.locator("#kc-login").click();

    // Should redirect back to NeoBoard dashboard
    await expect(page).toHaveURL("/", { timeout: 30_000 });

    // User should be logged in — check for dashboard content
    await expect(
      page.getByRole("heading", { name: /dashboard/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("SSO admin user gets admin role via claim mapping", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/login", { waitUntil: "networkidle" });

    const ssoButton = page.getByRole("button", {
      name: "Sign in with Keycloak Test",
    });
    await expect(ssoButton).toBeVisible({ timeout: 10_000 });
    await ssoButton.click();

    await expect(page).toHaveURL(/\/realms\/neoboard-test\//, {
      timeout: 15_000,
    });

    // Log in as admin user (in neoboard-admins group)
    await page.locator("#username").fill("sso-admin");
    await page.locator("#password").fill("password123");
    await page.locator("#kc-login").click();

    await expect(page).toHaveURL("/", { timeout: 30_000 });

    // Admin should see the Users page in sidebar (admin-only)
    await page.goto("/users");
    await expect(page).toHaveURL("/users");
    await expect(
      page.getByRole("heading", { name: /user/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("SSO — Settings > Authentication", () => {
  test("admin can see configured SSO providers", async ({ authPage, page }) => {
    // Login as admin (Alice) via password
    await authPage.login(ALICE.email, ALICE.password);
    await expect(page).toHaveURL("/");

    // Navigate to Settings > Authentication
    await page.goto("/settings/authentication");

    // The seeded Keycloak provider should be listed
    await expect(page.getByText("Keycloak Test")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Enabled")).toBeVisible();
  });
});
