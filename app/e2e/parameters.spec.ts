import { test, expect, ALICE, createTestDashboard } from "./fixtures";

test.describe("Parameter selectors", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Params ${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("should create a parameter-select widget", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select "Parameter Selector" chart type
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Parameter Selector" }).click();
    // Select Neo4j connection
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Configure the query for distinct values via the seed-query textarea
    // (CodeMirror is hidden for parameter-select widgets; SeedQueryInput uses a textarea)
    await dialog.locator("#seed-query").fill(
      "MATCH (m:Movie) RETURN DISTINCT m.released ORDER BY m.released LIMIT 10"
    );

    // Set the parameter name
    const paramInput = dialog.getByLabel("Parameter Name");
    await expect(paramInput).toBeVisible({ timeout: 5_000 });
    await paramInput.fill("year");

    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("should create a widget with click action and verify parameter mapping UI", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Bar Chart (default) + connection
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Write query and run it
    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText(
      "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS movie, count(p) AS cast_size ORDER BY cast_size DESC LIMIT 5"
    );
    await dialog.getByRole("button", { name: "Run" }).click();
    // Wait for preview
    await expect(dialog.locator(".border.rounded-lg").first()).toBeVisible({
      timeout: 15_000,
    });

    // Navigate to Advanced tab — click action settings live there
    await dialog.getByRole("tab", { name: "Advanced" }).click();
    // Enable click action
    await dialog.getByLabel("Enable click action").click();
    // Parameter name input should appear
    await expect(dialog.getByLabel("Parameter Name")).toBeVisible();
    await dialog.getByLabel("Parameter Name").fill("selected_movie");

    // Source field — should show a dropdown with fields from the query result
    await expect(dialog.getByLabel("Source Field")).toBeVisible();

    // Add the widget
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();
  });
});

test.describe("Parameter bar on view page", () => {
  test("seeded dashboard should render without parameter bar initially", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // The dashboard should load with widgets
    await expect(page.getByText("Top 10 Movies by Cast Size")).toBeVisible({
      timeout: 15_000,
    });
    // No parameter bar should be visible initially (no filters active)
    await expect(page.getByText("Reset")).not.toBeVisible();
  });
});

test.describe("Parameter-to-refresh cycle", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  /**
   * End-to-end test that verifies the full parameter flow:
   * 1. Create a parameter-select widget that populates a dropdown
   * 2. Create a dependent table widget whose query references $param_year
   * 3. Save the dashboard, switch to view mode
   * 4. Select a year value from the parameter dropdown
   * 5. Verify the dependent widget doesn't show a query error
   */
  test("selecting a parameter value should refresh dependent widgets", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);

    // Create a fresh dashboard for this test via API
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Param Cycle ${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();

    // --- Widget 1: Parameter-select (year dropdown) ---
    // Use .first() because a fresh dashboard shows both a toolbar and an empty-state "Add Widget" button
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    // Scope dialog to the "Add Widget" modal by name to avoid matching Radix popovers
    // that also have role="dialog" and can cause strict mode violations
    let dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select "Parameter Selector" chart type
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Parameter Selector" }).click();
    // Select Neo4j connection
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Configure query for distinct years via the seed-query textarea
    // (CodeMirror is hidden for parameter-select widgets; SeedQueryInput uses a textarea)
    await dialog.locator("#seed-query").fill(
      "MATCH (m:Movie) RETURN DISTINCT m.released ORDER BY m.released LIMIT 10"
    );

    // Set parameter name
    const paramNameInput = dialog.getByLabel("Parameter Name");
    await paramNameInput.fill("year");

    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();

    // --- Widget 2: Dependent table using $param_year ---
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select "Data Table" chart type
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();
    // Select connection
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText(
      "MATCH (m:Movie) WHERE m.released = $param_year RETURN m.title AS title LIMIT 5"
    );
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();

    // Save the dashboard
    await page.getByRole("button", { name: "Save" }).click();
    // Wait for save to complete (button text changes while saving)
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled({ timeout: 10_000 });

    // Navigate to view mode via the "Back" button
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // The parameter-select widget should render a dropdown with "year" label
    await expect(page.getByText("year", { exact: true })).toBeVisible({ timeout: 15_000 });

    // Select a value from the parameter dropdown.
    // The ParamSelector placeholder uses Unicode ellipsis "…" (U+2026), not three periods
    const paramTrigger = page.getByText("Select a value…");
    await paramTrigger.click();
    // Pick the first available year option from the Radix select dropdown
    const firstOption = page.getByRole("option").first();
    await expect(firstOption).toBeVisible({ timeout: 5_000 });
    await firstOption.click();

    // After selecting a parameter, the dependent table widget should refresh
    // and should NOT show a "Query Failed" error (it had one before selection
    // because $param_year was not yet set)
    await page.waitForTimeout(3_000); // allow query to re-execute
    await expect(page.locator("text=Query Failed")).not.toBeVisible();
  });
});
