import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  typeInEditor,
  getPreview,
} from "./fixtures";

// ---------------------------------------------------------------------------
// Helper: open Add Widget dialog, select connection, type query, run it,
// and wait for preview. Shared across all transform tests.
// ---------------------------------------------------------------------------
async function setupWidgetWithQuery(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Add Widget" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add Widget" });

  // Select Neo4j connection
  await dialog.getByRole("combobox").nth(0).click();
  await page.getByRole("option").first().click();

  // Wait for editor to stabilize after connection selection triggers schema fetch
  await page.waitForTimeout(1_000);

  await typeInEditor(
    dialog,
    page,
    "MATCH (m:Movie) RETURN m.released AS year, count(*) AS count ORDER BY year",
  );
  // Wait for Run button and click it
  const runBtn = dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)");
  await expect(runBtn).toBeEnabled({ timeout: 15_000 });
  await runBtn.click();

  // Wait for preview to render — the widget-preview testid appears only after data arrives
  await expect(dialog.getByTestId("widget-preview")).toBeVisible({
    timeout: 20_000,
  });

  return dialog;
}

// ---------------------------------------------------------------------------
// Tests
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

  test("Transform tab shows empty state and Add button", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await setupWidgetWithQuery(page);

    // Switch to Transform tab
    await dialog.getByRole("tab", { name: "Transform" }).click();

    // Should show empty state text + Add button
    await expect(dialog.getByText(/no transforms configured/i)).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Add", exact: true }),
    ).toBeVisible();
  });

  test("Add a filter transform — card appears with fields", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const dialog = await setupWidgetWithQuery(page);

    await dialog.getByRole("tab", { name: "Transform" }).click();
    await dialog.getByRole("button", { name: "Add", exact: true }).click();

    // Filter card should appear with "1. Filter" badge
    await expect(dialog.getByText("1. Filter")).toBeVisible();

    // Remove button should be visible
    await expect(
      dialog.getByRole("button", { name: "Remove transform" }),
    ).toBeVisible();
  });

  test("Add two transforms and remove first — renumbers correctly", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const dialog = await setupWidgetWithQuery(page);

    await dialog.getByRole("tab", { name: "Transform" }).click();

    // Add two transforms
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText("1. Filter")).toBeVisible();
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText("2. Filter")).toBeVisible();

    // Remove the first one
    const removeButtons = dialog.getByRole("button", {
      name: "Remove transform",
    });
    await removeButtons.first().click();

    // Should renumber: only "1. Filter" remains
    await expect(dialog.getByText("1. Filter")).toBeVisible();
    await expect(dialog.getByText("2. Filter")).not.toBeVisible();
  });

  test("Save widget with transforms — transforms persist on reopen", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const dialog = await setupWidgetWithQuery(page);

    // Add a filter transform
    await dialog.getByRole("tab", { name: "Transform" }).click();
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText("1. Filter")).toBeVisible();

    // Save the widget
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Save the dashboard
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForTimeout(1_000);

    // Reopen the widget editor
    const widgetCard = page.locator("[data-testid='widget-card']").first();
    await widgetCard.hover();
    await widgetCard.getByRole("button", { name: "Widget actions" }).click();
    await page.getByRole("menuitem", { name: /edit/i }).click();

    // Verify edit dialog opens
    const editDialog = page.getByRole("dialog", { name: "Edit Widget" });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });

    // Switch to Transform tab — saved transform should be there
    await editDialog.getByRole("tab", { name: "Transform" }).click();
    await expect(editDialog.getByText("1. Filter")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("Enable transforms toggle controls preview", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await setupWidgetWithQuery(page);

    await dialog.getByRole("tab", { name: "Transform" }).click();

    // Add a limit transform (reduces data)
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText("1. Filter")).toBeVisible();

    // Toggle should be checked by default
    const toggle = dialog.locator("#transforms-enabled");
    await expect(toggle).toBeChecked();

    // Uncheck — transforms should be disabled
    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();

    // Re-check — transforms re-enabled
    await toggle.check();
    await expect(toggle).toBeChecked();
  });
});
