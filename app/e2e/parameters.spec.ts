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

    // Action type selector should appear (defaults to "Set Parameter")
    await expect(dialog.getByLabel("Action Type")).toBeVisible();

    // Parameter name input should appear (CreatableCombobox)
    await expect(dialog.getByLabel("Parameter Name")).toBeVisible();
    await dialog.getByLabel("Parameter Name").fill("selected_movie");

    // Source field — should show a dropdown with fields from the query result
    // (visible for bar charts, hidden for tables)
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

test.describe("Click actions", () => {
  test("cell-click on table sets a parameter and updates dependent widgets", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);

    // Navigate to the seeded "Click Actions" demo dashboard
    await page.getByText("Click Actions").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // The first page should load — "Cell Click → Parameter"
    // Wait for the table with movie titles to render
    const movieCell = page.locator("td").filter({ hasText: "The Matrix" });
    await expect(movieCell.first()).toBeVisible({ timeout: 15_000 });

    // Click a cell in the movies table
    await movieCell.first().click();

    // The parameter bar should appear with a cross-filter tag
    await expect(page.getByText("Reset")).toBeVisible({ timeout: 5_000 });

    // The dependent widgets should re-run without errors
    await page.waitForTimeout(2_000);
    await expect(page.locator("text=Query Failed")).not.toBeVisible();
  });

  test("click action with navigate-to-page switches to target page", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);

    // Navigate to the seeded "Click Actions" demo dashboard
    await page.getByText("Click Actions").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // Navigate to the "Navigate to Page" tab (page 3)
    await page.getByRole("tab", { name: "Navigate to Page" }).click();

    // Wait for the table to load
    const movieCell = page.locator("td").filter({ hasText: "The Matrix" });
    await expect(movieCell.first()).toBeVisible({ timeout: 15_000 });

    // Click a movie title cell — should navigate to page 1 and set the parameter
    await movieCell.first().click();

    // After navigation, "Cell Click → Parameter" tab should be active
    await expect(
      page.getByRole("tab", { name: "Cell Click → Parameter" })
    ).toHaveAttribute("data-state", "active", { timeout: 5_000 });

    // The parameter bar should show the clicked value
    await expect(page.getByText("Reset")).toBeVisible({ timeout: 5_000 });
  });

  test("widget editor hides source field for table chart type", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Click UI ${Date.now()}`,
    );

    try {
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible();

      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });

      // Select "Data Table" chart type
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "Data Table" }).click();
      // Select connection
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      // Navigate to Advanced tab and enable click action
      await dialog.getByRole("tab", { name: "Advanced" }).click();
      await dialog.getByLabel("Enable click action").click();

      // Action type selector should appear
      await expect(dialog.getByLabel("Action Type")).toBeVisible();
      // Parameter Name should appear
      await expect(dialog.getByLabel("Parameter Name")).toBeVisible();
      // Source Field should NOT appear for tables
      await expect(dialog.getByLabel("Source Field")).not.toBeVisible();
      // Should show the cell-click explanation text
      await expect(
        dialog.getByText("Tables use cell-click")
      ).toBeVisible();

      await dialog.getByRole("button", { name: "Cancel" }).click();
    } finally {
      await cleanup();
    }
  });

  test("widget editor shows action type options including navigate", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Click Nav UI ${Date.now()}`,
    );

    try {
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible();

      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });

      // Select Bar chart + connection
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      // Navigate to Advanced tab and enable click action
      await dialog.getByRole("tab", { name: "Advanced" }).click();
      await dialog.getByLabel("Enable click action").click();

      // Click the action type select to see options
      await dialog.getByLabel("Action Type").click();
      await expect(page.getByRole("option", { name: "Set Parameter" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Navigate to Page" })).toBeVisible();
      await expect(page.getByRole("option", { name: /Set Parameter.*Navigate/ })).toBeVisible();

      // Select "Navigate to Page"
      await page.getByRole("option", { name: "Navigate to Page" }).click();

      // Parameter Name and Source Field should be hidden
      await expect(dialog.getByLabel("Parameter Name")).not.toBeVisible();
      await expect(dialog.getByLabel("Source Field")).not.toBeVisible();
      // Target Page should be visible (but show "add more pages" message for single-page dashboard)
      await expect(dialog.getByText("Add more pages")).toBeVisible();

      await dialog.getByRole("button", { name: "Cancel" }).click();
    } finally {
      await cleanup();
    }
  });
});
