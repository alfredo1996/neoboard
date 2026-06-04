import { test, expect, ALICE } from "./fixtures";

/**
 * Verifies SSO gating on community edition (the default global-setup state —
 * NEOBOARD_EDITION is not set).
 *
 * The inverse (enterprise mode exposing the SSO management UI) is tracked
 * in #933 — it requires a second Next.js server with NEOBOARD_EDITION=enterprise,
 * which is a substantial global-setup overhaul.
 */
test.describe("SSO gating — community edition", () => {
  test.beforeEach(async ({ authPage, sidebarPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await sidebarPage.navigateTo("Settings");
  });

  test("Authentication tab is NOT visible in settings nav", async ({
    page,
  }) => {
    await expect(page.getByRole("button", { name: "Profile" })).toBeVisible();
    await expect(page.getByRole("button", { name: "API Keys" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Authentication" }),
    ).toHaveCount(0);
  });

  test("/settings/authentication shows Enterprise-required empty state", async ({
    page,
  }) => {
    await page.goto("/settings/authentication");
    // The empty state component renders the feature title and description
    await expect(page.getByText(/Single Sign-On/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Enterprise feature/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Learn about Enterprise/i }),
    ).toBeVisible();
    // Critical: the SSO management UI is NOT rendered
    await expect(
      page.getByRole("button", { name: /Add Provider/i }),
    ).toHaveCount(0);
  });

  test("/api/sso-providers returns 402 ENTERPRISE_REQUIRED", async ({
    request,
  }) => {
    const res = await request.get("/api/sso-providers");
    expect(res.status()).toBe(402);
    const body = await res.json();
    expect(body.error?.code).toBe("ENTERPRISE_REQUIRED");
  });
});

test.describe("SSO gating — login page (community)", () => {
  test("login page renders no SSO buttons", async ({ page }) => {
    await page.goto("/login");
    // Standard email/password form is present
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    // No "Sign in with X" SSO buttons (no providers configured + edition gates)
    await expect(
      page.getByRole("button", { name: /Sign in with/i }),
    ).toHaveCount(0);
  });

  test("/api/auth/sso-providers returns empty array (no auth required)", async ({
    request,
  }) => {
    const res = await request.get("/api/auth/sso-providers");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.meta?.enforceSso).toBe(false);
  });
});
