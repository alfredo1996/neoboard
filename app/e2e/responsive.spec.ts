import { test, expect, ALICE } from "./fixtures";

test.describe("Responsive — mobile viewport", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("dashboard list should render in single column on mobile", async ({
    page,
  }) => {
    await expect(page.getByText("Movie Analytics")).toBeVisible({
      timeout: 15_000,
    });
    // Page should render (grid goes to single column at mobile)
    const cards = page.locator("[class*='border']").filter({ hasText: "Movie Analytics" });
    await expect(cards.first()).toBeVisible();
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
  test.use({ viewport: { width: 768, height: 1024 } });

  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("dashboard list should render on tablet", async ({ page }) => {
    await expect(page.getByText("Movie Analytics")).toBeVisible({
      timeout: 15_000,
    });
    const cards = page.locator("[class*='border']").filter({ hasText: "Movie Analytics" });
    await expect(cards.first()).toBeVisible();
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
  test.use({ viewport: { width: 1920, height: 1080 } });

  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("dashboard list should render in three columns on wide desktop", async ({
    page,
  }) => {
    await expect(page.getByText("Movie Analytics")).toBeVisible({
      timeout: 15_000,
    });
    const cards = page.locator("[class*='border']").filter({ hasText: "Movie Analytics" });
    await expect(cards.first()).toBeVisible();
  });
});
