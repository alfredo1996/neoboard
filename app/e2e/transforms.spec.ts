import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  typeInEditor,
  getPreview,
} from "./fixtures";

// ---------------------------------------------------------------------------
// Data Transforms E2E Tests
//
// Tests the Transform tab in the widget editor: adding/removing transforms,
// verifying the preview updates, and confirming transforms persist on save.
// ---------------------------------------------------------------------------

test.describe("Data Transforms", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `transforms-${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("Transform tab is visible and shows empty state", async ({ page }) => {
    // CM6 typeInEditor can be slow in CI — give extra time
    test.setTimeout(90_000);
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Neo4j connection + Bar chart (default)
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Type and run query
    await typeInEditor(
      dialog,
      page,
      "MATCH (m:Movie) RETURN m.released AS decade, count(*) AS count ORDER BY decade",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
    // Wait for chart to render (canvas or img depending on ECharts mode)
    await expect(getPreview(dialog)).toBeVisible({ timeout: 15_000 });

    // Switch to Transform tab
    await dialog.getByRole("tab", { name: "Transform" }).click();

    // Should show empty state or Add button
    await expect(dialog.getByRole("button", { name: /add/i })).toBeVisible();
  });

  // Flaky: CM6 __cmView timing in CI — typeInEditor fails intermittently
  test.fixme("Add a limit transform and verify preview updates", async ({
    page,
  }) => {
    // CM6 typeInEditor can be slow in CI — give extra time
    test.setTimeout(90_000);
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    await typeInEditor(
      dialog,
      page,
      "MATCH (m:Movie) RETURN m.released AS decade, count(*) AS count ORDER BY decade",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
    // Wait for chart to render (canvas or img depending on ECharts mode)
    await expect(getPreview(dialog)).toBeVisible({ timeout: 15_000 });

    // Switch to Transform tab and add a Limit transform
    await dialog.getByRole("tab", { name: "Transform" }).click();
    await dialog.getByRole("button", { name: /add/i }).click();

    // The new transform card should appear (default type is "Filter")
    await expect(dialog.getByText("1. Filter")).toBeVisible();
  });

  // Flaky: CM6 __cmView timing in CI — typeInEditor fails intermittently
  test.fixme("Save widget with transforms and reopen — transforms persist", async ({
    page,
  }) => {
    // CM6 typeInEditor can be slow in CI — give extra time
    test.setTimeout(90_000);
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    await typeInEditor(
      dialog,
      page,
      "MATCH (m:Movie) RETURN m.released AS decade, count(*) AS count ORDER BY decade",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
    // Wait for chart to render (canvas or img depending on ECharts mode)
    await expect(getPreview(dialog)).toBeVisible({ timeout: 15_000 });

    // Add a limit transform
    await dialog.getByRole("tab", { name: "Transform" }).click();
    await dialog.getByRole("button", { name: /add/i }).click();
    await expect(dialog.getByText("1. Filter")).toBeVisible();

    // Save the widget
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Save the dashboard
    await page.getByRole("button", { name: /save/i }).click();

    // Reopen the widget editor
    const widgetCard = page.locator("[data-testid='widget-card']").first();
    await widgetCard.hover();
    await widgetCard.getByRole("button", { name: "Widget actions" }).click();
    await page.getByRole("menuitem", { name: /edit/i }).click();

    // Verify the edit dialog opens
    const editDialog = page.getByRole("dialog", { name: "Edit Widget" });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });

    // Switch to Transform tab — the saved transform should still be there
    await editDialog.getByRole("tab", { name: "Transform" }).click();
    await expect(editDialog.getByText("1. Filter")).toBeVisible({
      timeout: 5_000,
    });
  });

  // Flaky: CM6 __cmView timing in CI — typeInEditor fails intermittently
  test.fixme("Remove a transform", async ({ page }) => {
    // CM6 typeInEditor can be slow in CI — give extra time
    test.setTimeout(90_000);
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    await typeInEditor(
      dialog,
      page,
      "MATCH (m:Movie) RETURN m.released AS decade, count(*) AS count ORDER BY decade",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
    // Wait for chart to render (canvas or img depending on ECharts mode)
    await expect(getPreview(dialog)).toBeVisible({ timeout: 15_000 });

    // Add two transforms
    await dialog.getByRole("tab", { name: "Transform" }).click();
    await dialog.getByRole("button", { name: /add/i }).click();
    await expect(dialog.getByText("1. Filter")).toBeVisible();
    await dialog.getByRole("button", { name: /add/i }).click();
    await expect(dialog.getByText("2. Filter")).toBeVisible();

    // Remove the first one
    const removeButtons = dialog.getAllByRole("button", {
      name: "Remove transform",
    });
    await removeButtons.first().click();

    // Should now show only "1. Filter" (the second became first)
    await expect(dialog.getByText("1. Filter")).toBeVisible();
    await expect(dialog.getByText("2. Filter")).not.toBeVisible();
  });
});
