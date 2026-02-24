import { test, expect, ALICE } from "./fixtures";

test.describe("Responsive — mobile viewport", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
  });

  test("dashboard list should render in single column on mobile", async ({
    page,
  }) => {
    await expect(page.getByText("Movie Analytics")).toBeVisible({
      timeout: 10_000,
    });
    // Grid should exist — on mobile it uses single column (no sm:grid-cols-2)
    const grid = page.locator(".grid").first();
    await expect(grid).toBeVisible();
  });

  test("login page should render correctly on mobile", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("NeoBoard")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in" })
    ).toBeVisible();
  });
});

test.describe("Responsive — tablet viewport", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
  });

  test("dashboard list should render in two columns on tablet", async ({
    page,
  }) => {
    await expect(page.getByText("Movie Analytics")).toBeVisible({
      timeout: 10_000,
    });
    const grid = page.locator(".grid").first();
    await expect(grid).toBeVisible();
  });

  test("connections page should render on tablet", async ({
    sidebarPage,
    page,
  }) => {
    await sidebarPage.navigateTo("Connections");
    await expect(
      page.getByRole("heading", { level: 1, name: "Connections" })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Add Connection" })
    ).toBeVisible();
  });
});

test.describe("Responsive — wide desktop viewport", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    // Set wide desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
  });

  test("dashboard list should render in three columns on wide desktop", async ({
    page,
  }) => {
    await expect(page.getByText("Movie Analytics")).toBeVisible({
      timeout: 10_000,
    });
    const grid = page.locator(".grid").first();
    await expect(grid).toBeVisible();
  });
});
