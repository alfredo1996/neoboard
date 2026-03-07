import { test, expect, ALICE, createTestDashboard, typeInEditor, getPreview } from "./fixtures";

// ---------------------------------------------------------------------------
// Styling rules editor — table widget
// ---------------------------------------------------------------------------

test.describe("Styling rules — table widget", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Styling Rules ${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  /**
   * Helper: add a table widget, run a query, and navigate to the Advanced tab.
   * Returns the scoped dialog locator.
   */
  async function addTableAndGoToAdvanced(page: import("@playwright/test").Page) {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Data Table + Neo4j connection
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();

    // Wait for editor to be ready (connection selection may cause re-render)
    await expect(dialog.locator("[data-testid='codemirror-container']")).toBeVisible({
      timeout: 5_000,
    });

    // Query and run
    await typeInEditor(
      dialog,
      page,
      "MATCH (m:Movie) RETURN m.title AS title, m.released AS released LIMIT 10",
    );
    await expect(dialog.getByTitle("Run query (Ctrl+Enter / \u2318+Enter)")).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByTitle("Run query (Ctrl+Enter / \u2318+Enter)").click();
    await expect(getPreview(dialog)).toBeVisible({ timeout: 15_000 });

    // Navigate to Advanced tab
    await dialog.getByRole("tab", { name: "Advanced" }).click();

    return dialog;
  }

  test("should enable styling, add a rule, and see rule count", async ({ page }) => {
    test.setTimeout(60_000);
    const dialog = await addTableAndGoToAdvanced(page);

    // Enable styling
    await dialog.getByLabel("Enable rule-based styling").click();
    await expect(dialog.getByText("No styling rules configured.")).toBeVisible();

    // Open Styling Rules editor
    await dialog.getByRole("button", { name: "Manage Styling Rules" }).click();

    // Should now show the Styling Rules heading
    await expect(page.getByRole("heading", { name: "Styling Rules" })).toBeVisible();
    await expect(page.getByText("No styling rules yet")).toBeVisible();

    // Add a rule
    await page.getByRole("button", { name: "Add Rule" }).click();
    await expect(page.getByText("Rule 1")).toBeVisible();

    // Verify default operator is <= and fill value
    await expect(page.getByText("<= (less or equal)")).toBeVisible();

    // Fill value for the rule — find the value input inside the rule content
    const valueInput = page.locator("input[type='number']").first();
    await valueInput.fill("2000");

    // Set color via the text input (not color picker)
    const colorInput = page.locator("input[placeholder='#3b82f6']").first();
    await colorInput.fill("#ef4444");

    // Click Done to return to main dialog
    await page.getByRole("button", { name: "Done" }).click();

    // Should return to the main dialog and show rule count
    // Navigate back to Advanced tab
    await dialog.getByRole("tab", { name: "Advanced" }).click();
    await expect(dialog.getByText("1 styling rule(s) configured.")).toBeVisible();
  });

  test("should show between operator with two bound inputs", async ({ page }) => {
    test.setTimeout(60_000);
    const dialog = await addTableAndGoToAdvanced(page);

    // Enable styling and open editor
    await dialog.getByLabel("Enable rule-based styling").click();
    await dialog.getByRole("button", { name: "Manage Styling Rules" }).click();

    // Add a rule
    await page.getByRole("button", { name: "Add Rule" }).click();
    await expect(page.getByText("Rule 1")).toBeVisible();

    // Change operator to "between"
    await page.getByLabel("Operator").click();
    await page.getByRole("option", { name: "between" }).click();

    // Should show two bound inputs
    await expect(page.getByText("From (min)")).toBeVisible();
    await expect(page.getByText("To (max)")).toBeVisible();

    await page.getByRole("button", { name: "Done" }).click();
  });

  test("should show target column selector for table type", async ({ page }) => {
    test.setTimeout(60_000);
    const dialog = await addTableAndGoToAdvanced(page);

    // Enable styling and open editor
    await dialog.getByLabel("Enable rule-based styling").click();
    await dialog.getByRole("button", { name: "Manage Styling Rules" }).click();

    // Should show "Target Column" label (tables only)
    await expect(page.getByText("Target Column")).toBeVisible();
    // The FieldSelectorInput placeholder
    await expect(page.getByText("Auto (first numeric)")).toBeVisible();

    await page.getByRole("button", { name: "Done" }).click();
  });

  test("should delete a rule", async ({ page }) => {
    test.setTimeout(60_000);
    const dialog = await addTableAndGoToAdvanced(page);

    // Enable styling and open editor
    await dialog.getByLabel("Enable rule-based styling").click();
    await dialog.getByRole("button", { name: "Manage Styling Rules" }).click();

    // Add 2 rules
    await page.getByRole("button", { name: "Add Rule" }).click();
    await expect(page.getByText("Rule 1")).toBeVisible();
    await page.getByRole("button", { name: "Add Rule" }).click();
    await expect(page.getByText("Rule 2")).toBeVisible();

    // Delete Rule 1
    await page.getByRole("button", { name: "Delete rule 1" }).click();

    // Should now show only 1 rule
    await expect(page.getByText("Rule 2")).not.toBeVisible();
    await expect(page.getByText("Rule 1")).toBeVisible(); // Remaining rule re-indexed

    // Click Done
    await page.getByRole("button", { name: "Done" }).click();

    // Verify rule count
    await dialog.getByRole("tab", { name: "Advanced" }).click();
    await expect(dialog.getByText("1 styling rule(s) configured.")).toBeVisible();
  });

  test("should save widget with styling and verify colored rows", async ({ page }) => {
    test.setTimeout(60_000);
    const dialog = await addTableAndGoToAdvanced(page);

    // Enable styling and open editor
    await dialog.getByLabel("Enable rule-based styling").click();
    await dialog.getByRole("button", { name: "Manage Styling Rules" }).click();

    // Add a rule: <= 1999 -> red
    await page.getByRole("button", { name: "Add Rule" }).click();
    const valueInput = page.locator("input[type='number']").first();
    await valueInput.fill("1999");
    const colorInput = page.locator("input[placeholder='#3b82f6']").first();
    await colorInput.fill("#ef4444");

    // Done
    await page.getByRole("button", { name: "Done" }).click();

    // Add Widget
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Save dashboard
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled({ timeout: 10_000 });

    // Navigate to view mode
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // Wait for the table to render with styled rows
    // The table should have at least one row with inline background-color style
    await expect(async () => {
      const styledRows = page.locator("[data-testid='widget-card'] tr[style*='background']");
      await expect(styledRows.first()).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
  });
});

// ---------------------------------------------------------------------------
// Styling rules — bar chart
// ---------------------------------------------------------------------------

test.describe("Styling rules — bar chart", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Styling Bar ${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("should enable styling for bar chart", async ({ page }) => {
    test.setTimeout(60_000);

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Bar Chart is default — select Neo4j connection
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();

    // Query and run
    await typeInEditor(
      dialog,
      page,
      "MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 5",
    );
    await expect(dialog.getByTitle("Run query (Ctrl+Enter / \u2318+Enter)")).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByTitle("Run query (Ctrl+Enter / \u2318+Enter)").click();
    await expect(getPreview(dialog)).toBeVisible({ timeout: 15_000 });

    // Navigate to Advanced tab
    await dialog.getByRole("tab", { name: "Advanced" }).click();

    // Enable styling
    await dialog.getByLabel("Enable rule-based styling").click();
    await expect(dialog.getByText("No styling rules configured.")).toBeVisible();

    // Open Styling Rules editor
    await dialog.getByRole("button", { name: "Manage Styling Rules" }).click();

    // Add a rule
    await page.getByRole("button", { name: "Add Rule" }).click();
    await expect(page.getByText("Rule 1")).toBeVisible();

    // "Target Column" should NOT be visible for bar charts (only tables)
    await expect(page.getByText("Target Column")).not.toBeVisible();

    // Click Done
    await page.getByRole("button", { name: "Done" }).click();

    // Verify rule count
    await dialog.getByRole("tab", { name: "Advanced" }).click();
    await expect(dialog.getByText("1 styling rule(s) configured.")).toBeVisible();

    // Save without errors
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });
});
