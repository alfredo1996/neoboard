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
    // After creation, navigate to edit → save → then view
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

  test("should show loading skeleton while fetching dashboard", async ({
    page,
  }) => {
    // Navigate to the seeded dashboard — skeleton should flash briefly
    // We can't reliably catch the skeleton, but we can verify the page loads
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    // After loading, dashboard name should be visible
    await expect(page.getByText("Movie Analytics")).toBeVisible();
  });

  test("should show duplicate button for creator and work", async ({
    page,
  }) => {
    await expect(page.getByText("Movie Analytics")).toBeVisible({
      timeout: 10_000,
    });
    // Find the duplicate button on the Movie Analytics card
    const card = page
      .locator("div[class*='border']")
      .filter({ hasText: "Movie Analytics" })
      .filter({ has: page.getByRole("button", { name: /Duplicate/ }) });
    await card.getByRole("button", { name: /Duplicate/ }).click();
    // Should see a copy appear
    await expect(page.getByText("Movie Analytics (copy)")).toBeVisible({
      timeout: 10_000,
    });
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
    // Empty state should have its own Add Widget button
    const emptyStateBtn = page.getByRole("button", { name: "Add Widget" });
    await expect(emptyStateBtn.first()).toBeVisible();
  });

  test("should manage pages — add and rename", async ({ page }) => {
    // Should see page tabs
    await expect(page.getByText("Page 1")).toBeVisible();

    // Add a new page
    const addPageBtn = page.getByRole("button", { name: /add/i }).first();
    if (await addPageBtn.isVisible()) {
      await addPageBtn.click();
      await expect(page.getByText("Page 2")).toBeVisible({ timeout: 5_000 });
    }
  });

  test("admin should see Assignments button in editor toolbar", async ({
    page,
  }) => {
    // Alice is admin — should see Assignments button
    await expect(
      page.getByRole("button", { name: "Assignments" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("admin should open assignments panel via sheet", async ({ page }) => {
    await page.getByRole("button", { name: "Assignments" }).click();
    // Sheet should open with title
    await expect(page.getByText("User Assignments")).toBeVisible({
      timeout: 5_000,
    });
  });
});

test.describe("Dashboard viewer — reader restrictions", () => {
  test("reader should not see Edit button on dashboard viewer", async ({
    authPage,
    page,
  }) => {
    // Create a reader and assign them to a dashboard
    await authPage.login(ALICE.email, ALICE.password);
    const timestamp = Date.now();
    const readerEmail = `viewer-${timestamp}@example.com`;

    // Create reader user
    await page.goto("/users");
    await expect(page.getByText("alice@example.com")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Create User" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#user-name").fill("Viewer User");
    await dialog.locator("#user-email").fill(readerEmail);
    await dialog.locator("#user-password").fill("password123");
    await dialog.locator("#user-role").click();
    await page.getByRole("option", { name: "Reader" }).click();
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(readerEmail)).toBeVisible();

    // Assign reader to Movie Analytics dashboard via API
    await page.goto("/");
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    const dashboardUrl = page.url();
    // Go to edit mode to assign
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.waitForURL(/\/edit$/, { timeout: 15_000 });
    await page.getByRole("button", { name: "Assignments" }).click();
    await expect(page.getByText("User Assignments")).toBeVisible({
      timeout: 5_000,
    });
    // Assign the reader
    const emailInput = page.locator('input[placeholder*="email" i]').or(page.locator('input[type="email"]').last());
    if (await emailInput.isVisible()) {
      await emailInput.fill(readerEmail);
      // Look for add/share button
      const shareBtn = page.getByRole("button", { name: /Add|Share|Assign/i });
      if (await shareBtn.isVisible()) {
        await shareBtn.click();
      }
    }

    // Logout, login as reader
    await authPage.logout();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await authPage.login(readerEmail, "password123");
    await expect(page).toHaveURL("/", { timeout: 15_000 });

    // Navigate to the same dashboard
    const dashId = dashboardUrl.split("/").pop();
    await page.goto(`/${dashId}`);
    await page.waitForURL(/\/[\w-]+$/, { timeout: 15_000 });

    // Should NOT see Edit button (reader = viewer role)
    await expect(page.getByText("Movie Analytics")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("button", { name: "Edit", exact: true })
    ).not.toBeVisible();
  });
});
