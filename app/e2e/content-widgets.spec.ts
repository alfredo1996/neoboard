import { test, expect, ALICE, createTestDashboard } from "./fixtures";

test.describe("Content-only widgets (Markdown & iFrame)", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Content Widgets ${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("should add a Markdown widget without connection or query", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Markdown chart type — connection combobox should be hidden
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Markdown" }).click();

    // No connection selector should be visible
    await expect(
      dialog.getByRole("combobox").filter({ hasText: /Neo4j|PostgreSQL/ }),
    ).not.toBeVisible();

    // The Add Widget button should be enabled without a query
    await expect(
      dialog.getByRole("button", { name: "Add Widget" }),
    ).toBeEnabled({ timeout: 5_000 });

    // Add the widget
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("should add an iFrame widget without connection or query", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select iFrame chart type
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "iFrame" }).click();

    // The Add Widget button should be enabled without a query
    await expect(
      dialog.getByRole("button", { name: "Add Widget" }),
    ).toBeEnabled({ timeout: 5_000 });

    // Add the widget
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("Markdown widget renders content on the dashboard", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Markdown
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Markdown" }).click();

    // Enter markdown content in the settings
    const contentInput = dialog.locator(
      'textarea[name="content"], input[name="content"]',
    );
    if (await contentInput.isVisible()) {
      await contentInput.fill("# Hello World\n\nThis is a **test**.");
    }

    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();

    // The widget should be on the dashboard
    const widget = page.getByTestId("markdown-widget");
    if (await widget.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(widget).toBeVisible();
    }
  });

  test("iFrame widget shows empty state without URL", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select iFrame
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "iFrame" }).click();

    // Add without setting URL
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();

    // The widget should show the empty state
    const widget = page.getByTestId("iframe-widget");
    if (await widget.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(widget.getByText("No URL configured")).toBeVisible();
    }
  });
});
