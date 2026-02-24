import { test, expect, ALICE } from "./fixtures";

test.describe("Dashboard viewer — uncovered states", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("should show 404 empty state for nonexistent dashboard", async ({
    page,
  }) => {
    await page.goto("/nonexistent-dashboard-id-12345");
    await expect(page.getByText("Dashboard not found")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText("doesn't exist or you don't have access")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Back to Dashboards/ })
    ).toBeVisible();
  });

  test("should show empty state when dashboard has no widgets", async ({
    page,
  }) => {
    // Create a new empty dashboard
    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#dashboard-name").fill("Empty State Test");
    await dialog.getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/\/edit/, { timeout: 10_000 });
    // Save the empty dashboard
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled({
      timeout: 10_000,
    });
    // Go to view mode
    await page.getByRole("button", { name: /Back/ }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    // Should show empty state
    await expect(page.getByText("No widgets yet")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("should navigate to dashboard and display content", async ({
    page,
  }) => {
    await page.getByText("Movie Analytics", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await expect(page.getByText("Movie Analytics")).toBeVisible();
  });
});

test.describe("Dashboard editor — uncovered states", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    // Create a fresh dashboard for editing tests
    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#dashboard-name").fill("Editor Test Dashboard");
    await dialog.getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/\/edit/, { timeout: 10_000 });
  });

  test("should show empty state in editor with Add Widget CTA", async ({
    page,
  }) => {
    await expect(page.getByText("No widgets yet")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Click "Add Widget" to get started.')).toBeVisible();
    const emptyStateBtn = page.getByRole("button", { name: "Add Widget" });
    await expect(emptyStateBtn.first()).toBeVisible();
  });

  test("should manage pages — add page", async ({ page }) => {
    await expect(page.getByText("Page 1")).toBeVisible();
    await page.getByRole("button", { name: "Add page" }).click();
    await expect(page.getByText("Page 2")).toBeVisible({ timeout: 5_000 });
  });

  test("admin should see Assignments button in editor toolbar", async ({
    page,
  }) => {
    await expect(
      page.getByRole("button", { name: "Assignments" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("admin should open assignments panel via sheet", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Assignments" })
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Assignments" }).click();
    await expect(page.getByText("User Assignments").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
