import { test, expect, ALICE, typeInEditor } from "./fixtures";

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

  test("admin should see Sharing button in editor toolbar", async ({
    page,
  }) => {
    await expect(
      page.getByRole("button", { name: "Sharing" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("admin should open sharing panel via sheet", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Sharing" })
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Sharing" }).click();
    await expect(page.getByText("Sharing").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("should rename a page via inline input", async ({ page }) => {
    await expect(page.getByText("Page 1")).toBeVisible();
    // Hover over the Page 1 tab and open options
    await page
      .getByRole("button", { name: "Page options for Page 1" })
      .click({ force: true });
    await page.getByText("Rename").click();

    // The inline rename input should appear — fill in new name
    const renameInput = page.locator("input[class*='text-sm']").last();
    await renameInput.fill("Overview");
    await page.keyboard.press("Enter");

    // Tab text should change to "Overview"
    await expect(page.getByText("Overview")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Page 1")).not.toBeVisible();
  });

  test("should delete a page when multiple pages exist", async ({ page }) => {
    await expect(page.getByText("Page 1")).toBeVisible();
    // Add a second page
    await page.getByRole("button", { name: "Add page" }).click();
    await expect(page.getByText("Page 2")).toBeVisible({ timeout: 5_000 });

    // Open page options for Page 2 and delete
    await page
      .getByRole("button", { name: "Page options for Page 2" })
      .click({ force: true });
    await page.getByText("Delete page").click();

    // Page 2 should be gone, Page 1 still visible
    await expect(page.getByText("Page 2")).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Page 1")).toBeVisible();
  });

  test("should navigate between pages in view mode", async ({ page }) => {
    test.setTimeout(90_000);
    // Add a widget on Page 1
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Single Value" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    await typeInEditor(dialog, page, "RETURN 42 AS answer");
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Add a second page
    await page.getByRole("button", { name: "Add page" }).click();
    await expect(page.getByText("Page 2")).toBeVisible({ timeout: 5_000 });
    // Click on Page 2 tab
    await page.getByText("Page 2").click();

    // Add widget on Page 2
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog2 = page.getByRole("dialog", { name: "Add Widget" });
    await dialog2.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();
    await dialog2.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await typeInEditor(dialog2, page, "MATCH (m:Movie) RETURN m.title LIMIT 3");
    await dialog2.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog2).not.toBeVisible({ timeout: 5_000 });

    // Save — wait for the PUT response to confirm save is complete
    const saveResponse = page.waitForResponse(
      (res) => res.url().includes("/api/dashboards/") && res.request().method() === "PUT",
      { timeout: 15_000 },
    );
    await page.getByRole("button", { name: "Save" }).click();
    await saveResponse;
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled({ timeout: 10_000 });

    // Go to view mode — extract dashboard ID from URL and navigate directly
    const editUrl = page.url();
    const viewUrl = editUrl.replace(/\/edit$/, "");
    await page.goto(viewUrl);
    await page.waitForURL(/\/[\w-]+$/, { timeout: 15_000 });

    // Both page tabs should be visible
    await expect(page.getByText("Page 1")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Page 2")).toBeVisible();

    // Widget from Page 1 should be visible initially
    await expect(page.locator("[data-testid='widget-card']").first()).toBeVisible({ timeout: 15_000 });
  });
});
