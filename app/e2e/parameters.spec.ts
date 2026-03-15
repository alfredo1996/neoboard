import { test, expect, ALICE, createTestDashboard, typeInEditor, getPreview } from "./fixtures";

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

  test("should create a widget with click action and verify action rules UI", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Bar Chart (default) + connection
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Write query and run it
    await typeInEditor(dialog, page,
      "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS movie, count(p) AS cast_size ORDER BY cast_size DESC LIMIT 5"
    );
    await expect(dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)")).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
    // Wait for preview
    await expect(getPreview(dialog)).toBeVisible({
      timeout: 15_000,
    });

    // Navigate to Advanced tab — click action settings live there
    await dialog.getByRole("tab", { name: "Advanced" }).click();
    // Enable click action
    await dialog.getByLabel("Enable click action").click();

    // "Manage Action Rules" button should appear
    await expect(dialog.getByRole("button", { name: "Manage Action Rules" })).toBeVisible();

    // Open rules editor and add a rule
    await dialog.getByRole("button", { name: "Manage Action Rules" }).click();
    const rulesDialog = page.getByRole("dialog", { name: "Action Rules" });
    await rulesDialog.getByRole("button", { name: "Add Rule" }).click();

    // Action type selector should appear (defaults to "Set Parameter")
    // Wait for accordion to expand after adding the rule.
    // Verify form labels are visible — proves the accordion expanded and rule form rendered.
    await expect(rulesDialog.getByText("Action Type")).toBeVisible({ timeout: 5_000 });
    // Parameter name input should appear
    await expect(rulesDialog.getByText("Parameter Name")).toBeVisible();
    // Source field — visible for bar charts
    await expect(rulesDialog.getByText("Source Field")).toBeVisible();

    // Go back and add the widget
    await rulesDialog.getByRole("button", { name: "Done" }).click();
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

    await typeInEditor(dialog, page,
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
    // Pick the first available year option from the Radix select dropdown.
    // Use toPass() to handle Radix animation instability (element may be
    // detached/re-mounted during the opening animation).
    await expect(async () => {
      await page.getByRole("option").first().click({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });

    // After selecting a parameter, the dependent table widget should refresh
    // and should NOT show a "Query Failed" error (it had one before selection
    // because $param_year was not yet set).
    // Wait for query re-execution by checking that no error appears.
    await expect(page.locator("text=Query Failed")).not.toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Click actions", () => {
  /**
   * Helper: create a dashboard with click-action widgets via the API.
   * Returns the dashboard ID and a cleanup function.
   */
  async function createClickActionDashboard(
    request: import("@playwright/test").APIRequestContext,
  ) {
    const res = await request.post("/api/dashboards", {
      data: { name: `Click Actions ${Date.now()}` },
    });
    if (!res.ok()) throw new Error(`Create dashboard failed: ${res.status()}`);
    const { id } = await res.json();

    const layout = {
      version: 2 as const,
      pages: [
        {
          id: "page-cell-click",
          title: "Cell Click",
          widgets: [
            {
              id: "ca-w1",
              chartType: "table",
              connectionId: "conn-neo4j-001",
              query: "MATCH (m:Movie) RETURN m.title AS title, m.released AS released ORDER BY m.title LIMIT 20",
              settings: {
                title: "Movies",
                clickAction: {
                  type: "set-parameter",
                  parameterMapping: { parameterName: "param_clicked_movie", sourceField: "" },
                },
              },
            },
            {
              id: "ca-w2",
              chartType: "bar",
              connectionId: "conn-neo4j-001",
              query: "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WHERE m.title = $param_clicked_movie RETURN p.name AS name, 1 AS count",
              settings: { title: "Cast" },
            },
          ],
          gridLayout: [
            { i: "ca-w1", x: 0, y: 0, w: 6, h: 5 },
            { i: "ca-w2", x: 6, y: 0, w: 6, h: 5 },
          ],
        },
        {
          id: "page-navigate",
          title: "Navigate to Page",
          widgets: [
            {
              id: "ca-w3",
              chartType: "table",
              connectionId: "conn-neo4j-001",
              query: "MATCH (m:Movie) RETURN m.title AS title, m.released AS released ORDER BY m.title LIMIT 20",
              settings: {
                title: "Click to navigate",
                clickAction: {
                  type: "set-parameter-and-navigate",
                  parameterMapping: { parameterName: "param_clicked_movie", sourceField: "" },
                  targetPageId: "page-cell-click",
                },
              },
            },
          ],
          gridLayout: [{ i: "ca-w3", x: 0, y: 0, w: 12, h: 5 }],
        },
      ],
    };

    const putRes = await request.put(`/api/dashboards/${id}`, {
      data: { layoutJson: layout },
    });
    if (!putRes.ok()) throw new Error(`Update dashboard failed: ${putRes.status()}`);

    return {
      id,
      cleanup: async () => { await request.delete(`/api/dashboards/${id}`); },
    };
  }

  test("cell-click on table sets a parameter and updates dependent widgets", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createClickActionDashboard(page.request);

    try {
      await page.goto(`/${id}`);

      // Wait for the table with movie titles to render.
      // Use "Apollo 13" — it's 3rd alphabetically, guaranteed on page 1
      // of the DataGrid (ORDER BY m.title LIMIT 20 returns first 20, paged at 10).
      const movieCell = page.locator("td").filter({ hasText: "Apollo 13" });
      await expect(movieCell.first()).toBeVisible({ timeout: 15_000 });

      // Click a cell in the movies table
      await movieCell.first().click();

      // The parameter bar should appear with a cross-filter tag
      await expect(page.getByText("Reset")).toBeVisible({ timeout: 5_000 });

      // The dependent widgets should re-run without errors
      await expect(page.locator("text=Query Failed")).not.toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanup();
    }
  });

  test("click action with navigate-to-page switches to target page", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createClickActionDashboard(page.request);

    try {
      await page.goto(`/${id}`);

      // Wait for the dashboard to load and render page tabs
      await expect(
        page.getByRole("tab", { name: "Navigate to Page" })
      ).toBeVisible({ timeout: 15_000 });

      // Navigate to the "Navigate to Page" tab
      await page.getByRole("tab", { name: "Navigate to Page" }).click();

      // Wait for the table on the ACTIVE page to load.
      // Both pages have "Apollo 13" in their tables, but page 1 is now hidden
      // (className="hidden", aria-hidden="true"). Scope to the visible container
      // so we don't accidentally pick page 1's hidden <td>.
      const activePage = page.locator('div[aria-hidden="false"]');
      const movieCell = activePage.locator("td").filter({ hasText: "Apollo 13" });
      await expect(movieCell.first()).toBeVisible({ timeout: 15_000 });

      // Click a movie title cell — should navigate to page 1 and set the parameter
      await movieCell.first().click();

      // After navigation, "Cell Click" tab should be active
      await expect(
        page.getByRole("tab", { name: "Cell Click" })
      ).toHaveAttribute("data-state", "active", { timeout: 5_000 });

      // The parameter bar should show the clicked value.
      // Both pages may render parameter bars, so use .first() to avoid
      // strict mode violation from matching 2 "Reset" buttons.
      await expect(page.getByText("Reset").first()).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanup();
    }
  });

  test("widget editor shows manage action rules button when click action enabled", async ({
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

      // Should show "Manage Action Rules" button
      await expect(dialog.getByRole("button", { name: "Manage Action Rules" })).toBeVisible();
      // Should show "No action rules configured." text
      await expect(dialog.getByText("No action rules configured.")).toBeVisible();

      await dialog.getByRole("button", { name: "Cancel" }).click();
    } finally {
      await cleanup();
    }
  });

  test("action rules editor opens and allows adding rules", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Action Rules ${Date.now()}`,
    );

    try {
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });

      // Select Bar chart + connection
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      // Run a query to get available fields
      await typeInEditor(dialog, page,
        "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS movie, count(p) AS cast_size LIMIT 5"
      );
      await expect(dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)")).toBeEnabled({ timeout: 10_000 });
      await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
      await expect(getPreview(dialog)).toBeVisible({
        timeout: 15_000,
      });

      // Navigate to Advanced tab and enable click action
      await dialog.getByRole("tab", { name: "Advanced" }).click();
      await dialog.getByLabel("Enable click action").click();

      // Click "Manage Action Rules" to open the rules editor
      await dialog.getByRole("button", { name: "Manage Action Rules" }).click();
      const rulesDialog = page.getByRole("dialog", { name: "Action Rules" });

      // Should show the Action Rules heading
      await expect(rulesDialog.getByRole("heading", { name: "Action Rules" })).toBeVisible();
      // Should show "No action rules yet" message
      await expect(rulesDialog.getByText("No action rules yet")).toBeVisible();

      // Click "Add Rule"
      await rulesDialog.getByRole("button", { name: "Add Rule" }).click();
      // Should show "Rule 1"
      await expect(rulesDialog.getByText("Rule 1")).toBeVisible();
      // Should show Action Type selector
      await expect(rulesDialog.getByText("Action Type")).toBeVisible({ timeout: 5_000 });
      // Should show Parameter Name
      await expect(rulesDialog.getByText("Parameter Name")).toBeVisible();
      // Should show Source Field (for bar chart, not table)
      await expect(rulesDialog.getByText("Source Field")).toBeVisible();

      // Click "Done" to return to main dialog
      await rulesDialog.getByRole("button", { name: "Done" }).click();
      // Navigate back to Advanced tab (Done returns to Data tab)
      await dialog.getByRole("tab", { name: "Advanced" }).click();
      // Should show "1 action rule(s) configured."
      await expect(dialog.getByText("1 action rule(s) configured.")).toBeVisible();

      await dialog.getByRole("button", { name: "Cancel" }).click();
    } finally {
      await cleanup();
    }
  });

  test("widget editor hides click action for unsupported chart types", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Unsupported Click ${Date.now()}`,
    );

    try {
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible();

      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });

      // Select connection first
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      // Select "Single Value" chart type
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "Single Value" }).click();

      // Navigate to Advanced tab — click action should NOT be visible
      await dialog.getByRole("tab", { name: "Advanced" }).click();
      await expect(dialog.getByLabel("Enable click action")).not.toBeVisible();

      // Switch to "JSON Viewer" — click action should also NOT be visible
      await dialog.getByRole("tab", { name: "Data" }).click();
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "JSON Viewer" }).click();
      await dialog.getByRole("tab", { name: "Advanced" }).click();
      await expect(dialog.getByLabel("Enable click action")).not.toBeVisible();

      // Switch to "Bar Chart" — click action should be visible
      await dialog.getByRole("tab", { name: "Data" }).click();
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "Bar Chart" }).click();
      await dialog.getByRole("tab", { name: "Advanced" }).click();
      await expect(dialog.getByLabel("Enable click action")).toBeVisible();

      await dialog.getByRole("button", { name: "Cancel" }).click();
    } finally {
      await cleanup();
    }
  });

  test("action rules editor shows trigger column for table chart type", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Clickable Cols ${Date.now()}`,
    );

    try {
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });

      // Select "Data Table" chart type
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "Data Table" }).click();
      // Select connection
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      // Write query and run it to populate available fields
      await typeInEditor(dialog, page,
        "MATCH (m:Movie) RETURN m.title AS title, m.released AS released LIMIT 5"
      );
      await expect(dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)")).toBeEnabled({ timeout: 10_000 });
      await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
      // Wait for preview to render
      await expect(getPreview(dialog)).toBeVisible({
        timeout: 15_000,
      });

      // Navigate to Advanced tab and enable click action
      await dialog.getByRole("tab", { name: "Advanced" }).click();
      await dialog.getByLabel("Enable click action").click();

      // Open the action rules editor
      await dialog.getByRole("button", { name: "Manage Action Rules" }).click();
      const rulesDialog = page.getByRole("dialog", { name: "Action Rules" });
      await expect(rulesDialog.getByRole("heading", { name: "Action Rules" })).toBeVisible();

      // Add a rule
      await rulesDialog.getByRole("button", { name: "Add Rule" }).click();
      await expect(rulesDialog.getByText("Rule 1")).toBeVisible();

      // Should show "Trigger Column" selector for tables
      await expect(rulesDialog.getByText("Trigger Column")).toBeVisible({ timeout: 5_000 });
      // Should show "Parameter Name" input
      await expect(rulesDialog.getByText("Parameter Name")).toBeVisible();
      // Source Field should NOT appear for table chart types
      await expect(rulesDialog.getByText("Source Field")).not.toBeVisible();

      // Click Done and cancel
      await rulesDialog.getByRole("button", { name: "Done" }).click();
      await dialog.getByRole("button", { name: "Cancel" }).click();
    } finally {
      await cleanup();
    }
  });
});

test.describe("Parameter interpolation in titles", () => {
  /**
   * Helper: create a dashboard with a parameter-select widget and a table whose
   * title contains $param_year.
   */
  async function createInterpolatedTitleDashboard(
    request: import("@playwright/test").APIRequestContext,
  ) {
    const res = await request.post("/api/dashboards", {
      data: { name: `Interpolation ${Date.now()}` },
    });
    if (!res.ok()) throw new Error(`Create dashboard failed: ${res.status()}`);
    const { id } = await res.json();

    const layout = {
      version: 2 as const,
      pages: [
        {
          id: "page-interp",
          title: "Main",
          widgets: [
            {
              id: "interp-param",
              chartType: "parameter-select",
              connectionId: "conn-neo4j-001",
              query: "",
              settings: {
                title: "Year Selector",
                chartOptions: {
                  parameterType: "select",
                  parameterName: "year",
                  seedQuery: "MATCH (m:Movie) RETURN DISTINCT m.released ORDER BY m.released LIMIT 10",
                },
              },
            },
            {
              id: "interp-table",
              chartType: "table",
              connectionId: "conn-neo4j-001",
              query: "MATCH (m:Movie) WHERE m.released = $param_year RETURN m.title AS title LIMIT 5",
              settings: {
                title: "Movies from $param_year",
              },
            },
          ],
          gridLayout: [
            { i: "interp-param", x: 0, y: 0, w: 4, h: 3 },
            { i: "interp-table", x: 4, y: 0, w: 8, h: 5 },
          ],
        },
      ],
    };

    const putRes = await request.put(`/api/dashboards/${id}`, {
      data: { layoutJson: layout },
    });
    if (!putRes.ok()) throw new Error(`Update dashboard failed: ${putRes.status()}`);

    return {
      id,
      cleanup: async () => { await request.delete(`/api/dashboards/${id}`); },
    };
  }

  test("widget title interpolates parameter values", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createInterpolatedTitleDashboard(page.request);

    try {
      await page.goto(`/${id}`);

      // Initially, the title should show the raw token because param is not set
      await expect(page.getByText("Movies from $param_year")).toBeVisible({
        timeout: 15_000,
      });

      // Select a year from the parameter dropdown
      const paramTrigger = page.getByText("Select a value…");
      await paramTrigger.click();
      // Pick the first available year option
      await expect(async () => {
        await page.getByRole("option").first().click({ timeout: 2_000 });
      }).toPass({ timeout: 15_000 });

      // After selecting a value, the raw token should no longer be visible
      // and the title should contain "Movies from" followed by a year number
      await expect(page.getByText("Movies from $param_year")).not.toBeVisible({
        timeout: 5_000,
      });
      // The widget card should show the interpolated title
      await expect(page.getByText(/Movies from \d{4}/)).toBeVisible({
        timeout: 5_000,
      });
    } finally {
      await cleanup();
    }
  });
});

test.describe("Clickable columns restriction", () => {
  /**
   * Helper: create a dashboard with a table that has clickableColumns restricted
   * to only "title".
   */
  async function createRestrictedColumnsDashboard(
    request: import("@playwright/test").APIRequestContext,
  ) {
    const res = await request.post("/api/dashboards", {
      data: { name: `Restricted Cols ${Date.now()}` },
    });
    if (!res.ok()) throw new Error(`Create dashboard failed: ${res.status()}`);
    const { id } = await res.json();

    const layout = {
      version: 2 as const,
      pages: [
        {
          id: "page-restrict",
          title: "Main",
          widgets: [
            {
              id: "rc-w1",
              chartType: "table",
              connectionId: "conn-neo4j-001",
              query: "MATCH (m:Movie) RETURN m.title AS title, m.released AS released ORDER BY m.title LIMIT 20",
              settings: {
                title: "Movies (click title only)",
                clickAction: {
                  type: "set-parameter",
                  parameterMapping: { parameterName: "param_movie", sourceField: "" },
                  clickableColumns: ["title"],
                },
              },
            },
          ],
          gridLayout: [{ i: "rc-w1", x: 0, y: 0, w: 12, h: 6 }],
        },
      ],
    };

    const putRes = await request.put(`/api/dashboards/${id}`, {
      data: { layoutJson: layout },
    });
    if (!putRes.ok()) throw new Error(`Update dashboard failed: ${putRes.status()}`);

    return {
      id,
      cleanup: async () => { await request.delete(`/api/dashboards/${id}`); },
    };
  }

  test("only restricted columns show link styling and respond to clicks", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createRestrictedColumnsDashboard(page.request);

    try {
      await page.goto(`/${id}`);

      // Wait for the table to render (query + rendering can be slow under load)
      const titleCell = page.locator("td").filter({ hasText: "Apollo 13" });
      await expect(titleCell.first()).toBeVisible({ timeout: 30_000 });

      // Title cells should have clickable styling (cursor-pointer on td, badge span inside)
      await expect(titleCell.first()).toHaveClass(/cursor-pointer/);
      // The badge span inside the title cell should have text-primary
      const badge = titleCell.first().locator("span.rounded-md");
      await expect(badge).toBeVisible();

      // Released cells (year numbers) should NOT have clickable styling.
      // Find a released cell in the same row as "Apollo 13" — the year is 1995.
      const releasedCell = page.locator("td").filter({ hasText: "1995" });
      await expect(releasedCell.first()).not.toHaveClass(/cursor-pointer/);

      // Click the released cell — should NOT set a parameter
      await releasedCell.first().click();
      await expect(page.getByText("Reset")).not.toBeVisible({ timeout: 2_000 });

      // Click the title cell — SHOULD set a parameter
      await titleCell.first().click();
      await expect(page.getByText("Reset")).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanup();
    }
  });
});

test.describe("Multi-rule click actions", () => {
  /**
   * Helper: create a dashboard with a table that has two action rules:
   * - Click "title" column → set param_movie
   * - Click "released" column → set param_year
   */
  async function createMultiRuleDashboard(
    request: import("@playwright/test").APIRequestContext,
  ) {
    const res = await request.post("/api/dashboards", {
      data: { name: `Multi Rule ${Date.now()}` },
    });
    if (!res.ok()) throw new Error(`Create dashboard failed: ${res.status()}`);
    const { id } = await res.json();

    const layout = {
      version: 2 as const,
      pages: [
        {
          id: "page-multi",
          title: "Main",
          widgets: [
            {
              id: "mr-w1",
              chartType: "table",
              connectionId: "conn-neo4j-001",
              query: "MATCH (m:Movie) RETURN m.title AS title, m.released AS released ORDER BY m.title LIMIT 20",
              settings: {
                title: "Movies (multi-rule)",
                clickAction: {
                  type: "set-parameter",
                  rules: [
                    {
                      id: "rule-title",
                      triggerColumn: "title",
                      type: "set-parameter",
                      parameterMapping: { parameterName: "param_movie", sourceField: "title" },
                    },
                    {
                      id: "rule-year",
                      triggerColumn: "released",
                      type: "set-parameter",
                      parameterMapping: { parameterName: "param_year", sourceField: "released" },
                    },
                  ],
                },
              },
            },
          ],
          gridLayout: [{ i: "mr-w1", x: 0, y: 0, w: 12, h: 6 }],
        },
      ],
    };

    const putRes = await request.put(`/api/dashboards/${id}`, {
      data: { layoutJson: layout },
    });
    if (!putRes.ok()) throw new Error(`Update dashboard failed: ${putRes.status()}`);

    return {
      id,
      cleanup: async () => { await request.delete(`/api/dashboards/${id}`); },
    };
  }

  test("multi-rule table: clicking different columns sets different parameters", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createMultiRuleDashboard(page.request);

    try {
      await page.goto(`/${id}`);

      // Wait for table to load
      const titleCell = page.locator("td").filter({ hasText: "Apollo 13" });
      await expect(titleCell.first()).toBeVisible({ timeout: 15_000 });

      // Both title and released columns should have badge styling
      await expect(titleCell.first()).toHaveClass(/cursor-pointer/);
      const titleBadge = titleCell.first().locator("span.rounded-md");
      await expect(titleBadge).toBeVisible();

      const yearCell = page.locator("td").filter({ hasText: "1995" });
      await expect(yearCell.first()).toHaveClass(/cursor-pointer/);

      // Click title column — should set param_movie
      await titleCell.first().click();
      await expect(page.getByText("Reset")).toBeVisible({ timeout: 5_000 });

      // Reset
      await page.getByText("Reset").first().click();
      await expect(page.getByText("Reset")).not.toBeVisible({ timeout: 5_000 });

      // Click year column — should set param_year
      await yearCell.first().click();
      await expect(page.getByText("Reset")).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanup();
    }
  });
});

// ── Parameter type injection tests ─────────────────────────────────────────
// Cover parameter types that have Vitest coverage but no E2E testing:
// date, date-range, date-relative, number-range, multi-select, cascading-select

test.describe("Date parameter widget", () => {
  async function createDateParamDashboard(
    request: import("@playwright/test").APIRequestContext,
  ) {
    const res = await request.post("/api/dashboards", {
      data: { name: `Date Param ${Date.now()}` },
    });
    if (!res.ok()) throw new Error(`Create dashboard failed: ${res.status()}`);
    const { id } = await res.json();

    const layout = {
      version: 2 as const,
      pages: [
        {
          id: "page-date",
          title: "Main",
          widgets: [
            {
              id: "date-param",
              chartType: "parameter-select",
              connectionId: "",
              query: "",
              settings: {
                title: "Date Picker",
                chartOptions: {
                  parameterType: "date",
                  parameterName: "test_date",
                },
              },
            },
            {
              id: "date-table",
              chartType: "table",
              connectionId: "conn-neo4j-001",
              query:
                "MATCH (m:Movie) RETURN m.title AS title, m.released AS year ORDER BY m.released LIMIT 5",
              settings: {
                title: "Movies (date: $param_test_date)",
                chartOptions: {},
              },
            },
          ],
          gridLayout: [
            { i: "date-param", x: 0, y: 0, w: 4, h: 3 },
            { i: "date-table", x: 4, y: 0, w: 8, h: 5 },
          ],
        },
      ],
    };

    const putRes = await request.put(`/api/dashboards/${id}`, {
      data: { layoutJson: layout },
    });
    if (!putRes.ok()) throw new Error(`Update dashboard failed: ${putRes.status()}`);

    return {
      id,
      cleanup: async () => { await request.delete(`/api/dashboards/${id}`); },
    };
  }

  test("date picker widget renders and allows date selection", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createDateParamDashboard(page.request);

    try {
      await page.goto(`/${id}`);

      // Wait for the date picker widget to render
      await expect(page.getByText("Pick a date…")).toBeVisible({ timeout: 15_000 });

      // Open the calendar popover
      await page.getByText("Pick a date…").click();

      // The calendar popover should render day cells
      await expect(page.locator("[role='gridcell']").first()).toBeVisible({
        timeout: 5_000,
      });

      // Click a day in the calendar
      await page.locator("[role='gridcell']").filter({ hasNotText: "" }).nth(10).click();

      // After selecting, the "Pick a date…" placeholder should be replaced with a formatted date
      await expect(page.getByText("Pick a date…")).not.toBeVisible({ timeout: 5_000 });
      // Verify the selected date displays in "MMM d, yyyy" format
      await expect(page.getByText(/\w{3} \d{1,2}, \d{4}/)).toBeVisible();

      // The title should interpolate the parameter value
      await expect(page.getByText("Movies (date: $param_test_date)")).not.toBeVisible({
        timeout: 5_000,
      });
    } finally {
      await cleanup();
    }
  });
});

test.describe("Date-range parameter widget", () => {
  async function createDateRangeParamDashboard(
    request: import("@playwright/test").APIRequestContext,
  ) {
    const res = await request.post("/api/dashboards", {
      data: { name: `DateRange Param ${Date.now()}` },
    });
    if (!res.ok()) throw new Error(`Create dashboard failed: ${res.status()}`);
    const { id } = await res.json();

    const layout = {
      version: 2 as const,
      pages: [
        {
          id: "page-drange",
          title: "Main",
          widgets: [
            {
              id: "drange-param",
              chartType: "parameter-select",
              connectionId: "",
              query: "",
              settings: {
                title: "Date Range",
                chartOptions: {
                  parameterType: "date-range",
                  parameterName: "test_daterange",
                },
              },
            },
          ],
          gridLayout: [
            { i: "drange-param", x: 0, y: 0, w: 6, h: 3 },
          ],
        },
      ],
    };

    const putRes = await request.put(`/api/dashboards/${id}`, {
      data: { layoutJson: layout },
    });
    if (!putRes.ok()) throw new Error(`Update dashboard failed: ${putRes.status()}`);

    return {
      id,
      cleanup: async () => { await request.delete(`/api/dashboards/${id}`); },
    };
  }

  test("date-range picker renders and allows preset selection", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createDateRangeParamDashboard(page.request);

    try {
      await page.goto(`/${id}`);

      // Wait for the date-range picker widget to render
      await expect(page.getByText("Pick a date range…")).toBeVisible({ timeout: 15_000 });

      // Open the calendar popover
      await page.getByText("Pick a date range…").click();

      // The preset sidebar should show "Last 7 days" button
      const preset = page.getByRole("button", { name: "Last 7 days" });
      await expect(preset).toBeVisible({ timeout: 5_000 });

      // Click the "Last 7 days" preset
      await preset.click();

      // After selection, the placeholder should be replaced with a date range
      // Format: "MMM d, yyyy – MMM d, yyyy"
      await expect(page.getByText("Pick a date range…")).not.toBeVisible({ timeout: 5_000 });
      await expect(page.getByText(/\w{3} \d{1,2}, \d{4}\s*–\s*\w{3} \d{1,2}, \d{4}/)).toBeVisible();

      // Clear button should appear
      const clearBtn = page.getByRole("button", { name: "Clear test_daterange" });
      await expect(clearBtn).toBeVisible();

      // Click clear to reset
      await clearBtn.click();
      await expect(page.getByText("Pick a date range…")).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanup();
    }
  });
});

test.describe("Date-relative parameter widget", () => {
  async function createDateRelativeParamDashboard(
    request: import("@playwright/test").APIRequestContext,
  ) {
    const res = await request.post("/api/dashboards", {
      data: { name: `DateRelative Param ${Date.now()}` },
    });
    if (!res.ok()) throw new Error(`Create dashboard failed: ${res.status()}`);
    const { id } = await res.json();

    const layout = {
      version: 2 as const,
      pages: [
        {
          id: "page-drel",
          title: "Main",
          widgets: [
            {
              id: "drel-param",
              chartType: "parameter-select",
              connectionId: "",
              query: "",
              settings: {
                title: "Relative Date",
                chartOptions: {
                  parameterType: "date-relative",
                  parameterName: "test_reldate",
                },
              },
            },
          ],
          gridLayout: [
            { i: "drel-param", x: 0, y: 0, w: 12, h: 3 },
          ],
        },
      ],
    };

    const putRes = await request.put(`/api/dashboards/${id}`, {
      data: { layoutJson: layout },
    });
    if (!putRes.ok()) throw new Error(`Update dashboard failed: ${putRes.status()}`);

    return {
      id,
      cleanup: async () => { await request.delete(`/api/dashboards/${id}`); },
    };
  }

  test("date-relative picker renders preset buttons and supports toggle", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createDateRelativeParamDashboard(page.request);

    try {
      await page.goto(`/${id}`);

      // Scope to the widget card to avoid collision with parameter bar tags
      const card = page.getByTestId("widget-card");

      // Wait for the relative date preset buttons to render
      const todayBtn = card.getByRole("button", { name: "Today" });
      await expect(todayBtn).toBeVisible({ timeout: 15_000 });

      // All presets should be visible
      await expect(card.getByRole("button", { name: "Yesterday" })).toBeVisible();
      await expect(card.getByRole("button", { name: "Last 7 days" })).toBeVisible();
      await expect(card.getByRole("button", { name: "Last 30 days" })).toBeVisible();
      await expect(card.getByRole("button", { name: "This month" })).toBeVisible();
      await expect(card.getByRole("button", { name: "This year" })).toBeVisible();

      // Initially none should be active
      await expect(todayBtn).toHaveAttribute("aria-pressed", "false");

      // Click "Today" — should become active
      await todayBtn.click();
      await expect(todayBtn).toHaveAttribute("aria-pressed", "true");

      // Click "Today" again — should toggle off
      await todayBtn.click();
      await expect(todayBtn).toHaveAttribute("aria-pressed", "false");

      // Click "Last 7 days" — should become active
      const last7 = card.getByRole("button", { name: "Last 7 days" });
      await last7.click();
      await expect(last7).toHaveAttribute("aria-pressed", "true");
      // "Today" should still be inactive
      await expect(todayBtn).toHaveAttribute("aria-pressed", "false");
    } finally {
      await cleanup();
    }
  });
});

test.describe("Number-range parameter widget", () => {
  async function createNumberRangeParamDashboard(
    request: import("@playwright/test").APIRequestContext,
  ) {
    const res = await request.post("/api/dashboards", {
      data: { name: `NumRange Param ${Date.now()}` },
    });
    if (!res.ok()) throw new Error(`Create dashboard failed: ${res.status()}`);
    const { id } = await res.json();

    const layout = {
      version: 2 as const,
      pages: [
        {
          id: "page-numrange",
          title: "Main",
          widgets: [
            {
              id: "numrange-param",
              chartType: "parameter-select",
              connectionId: "",
              query: "",
              settings: {
                title: "Year Range",
                chartOptions: {
                  parameterType: "number-range",
                  parameterName: "test_numrange",
                  rangeMin: 1900,
                  rangeMax: 2020,
                  rangeStep: 1,
                },
              },
            },
          ],
          gridLayout: [
            { i: "numrange-param", x: 0, y: 0, w: 6, h: 3 },
          ],
        },
      ],
    };

    const putRes = await request.put(`/api/dashboards/${id}`, {
      data: { layoutJson: layout },
    });
    if (!putRes.ok()) throw new Error(`Update dashboard failed: ${putRes.status()}`);

    return {
      id,
      cleanup: async () => { await request.delete(`/api/dashboards/${id}`); },
    };
  }

  test("number-range slider renders inputs and supports interaction", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createNumberRangeParamDashboard(page.request);

    try {
      await page.goto(`/${id}`);

      // Wait for the number-range widget to render — min/max inputs
      const minInput = page.getByLabel("test_numrange minimum");
      const maxInput = page.getByLabel("test_numrange maximum");
      await expect(minInput).toBeVisible({ timeout: 15_000 });
      await expect(maxInput).toBeVisible();

      // Default values should match rangeMin/rangeMax
      await expect(minInput).toHaveValue("1900");
      await expect(maxInput).toHaveValue("2020");

      // Change the min input — should trigger parameter set and show Reset button.
      // Two "Reset" buttons may appear (slider + parameter bar), so use .first().
      await minInput.fill("1950");
      await expect(page.getByRole("button", { name: "Reset" }).first()).toBeVisible({ timeout: 5_000 });

      // Change the max input
      await maxInput.fill("2000");
      await expect(maxInput).toHaveValue("2000");

      // Click Reset — should clear the range (both slider and parameter bar Reset disappear)
      await page.getByRole("button", { name: "Reset" }).first().click();
      await expect(page.getByRole("button", { name: "Reset" }).first()).not.toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanup();
    }
  });
});

test.describe("Multi-select parameter widget", () => {
  async function createMultiSelectParamDashboard(
    request: import("@playwright/test").APIRequestContext,
  ) {
    const res = await request.post("/api/dashboards", {
      data: { name: `MultiSelect Param ${Date.now()}` },
    });
    if (!res.ok()) throw new Error(`Create dashboard failed: ${res.status()}`);
    const { id } = await res.json();

    const layout = {
      version: 2 as const,
      pages: [
        {
          id: "page-multiselect",
          title: "Main",
          widgets: [
            {
              id: "multiselect-param",
              chartType: "parameter-select",
              connectionId: "conn-neo4j-001",
              query: "",
              settings: {
                title: "Person Selector",
                chartOptions: {
                  parameterType: "multi-select",
                  parameterName: "test_people",
                  seedQuery:
                    "MATCH (p:Person) RETURN p.name AS value, p.name AS label ORDER BY p.name LIMIT 10",
                },
              },
            },
            {
              id: "multiselect-table",
              chartType: "table",
              connectionId: "conn-neo4j-001",
              query:
                "MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) WHERE p.name IN $param_test_people RETURN p.name AS person, m.title AS movie ORDER BY p.name LIMIT 20",
              settings: {
                title: "Filmography",
                chartOptions: {},
              },
            },
          ],
          gridLayout: [
            { i: "multiselect-param", x: 0, y: 0, w: 4, h: 3 },
            { i: "multiselect-table", x: 4, y: 0, w: 8, h: 5 },
          ],
        },
      ],
    };

    const putRes = await request.put(`/api/dashboards/${id}`, {
      data: { layoutJson: layout },
    });
    if (!putRes.ok()) throw new Error(`Update dashboard failed: ${putRes.status()}`);

    return {
      id,
      cleanup: async () => { await request.delete(`/api/dashboards/${id}`); },
    };
  }

  test("multi-select widget renders and allows selecting multiple values", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createMultiSelectParamDashboard(page.request);

    try {
      await page.goto(`/${id}`);

      // Wait for the multi-select widget to load its options
      await expect(page.getByText("Select values…")).toBeVisible({ timeout: 15_000 });

      // Open the multi-select dropdown
      await page.getByText("Select values…").click();

      // Options should load from the seed query
      await expect(page.getByRole("option").first()).toBeVisible({ timeout: 10_000 });

      // Select the first option
      await page.getByRole("option").first().click();

      // Select the second option (dropdown stays open for multi-select)
      await page.getByRole("option").nth(1).click();

      // Close the dropdown by pressing Escape
      await page.keyboard.press("Escape");

      // "Select values…" placeholder should be gone — values are now selected
      await expect(page.getByText("Select values…")).not.toBeVisible({ timeout: 5_000 });

      // "Clear" button should appear (confirms values are selected)
      await expect(page.getByText("Clear")).toBeVisible();

      // The dependent table should re-execute without errors
      await expect(page.locator("text=Query Failed")).not.toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanup();
    }
  });
});

test.describe("Cascading-select parameter widget", () => {
  async function createCascadingSelectDashboard(
    request: import("@playwright/test").APIRequestContext,
  ) {
    const res = await request.post("/api/dashboards", {
      data: { name: `Cascading Param ${Date.now()}` },
    });
    if (!res.ok()) throw new Error(`Create dashboard failed: ${res.status()}`);
    const { id } = await res.json();

    const layout = {
      version: 2 as const,
      pages: [
        {
          id: "page-cascade",
          title: "Main",
          widgets: [
            {
              id: "cascade-parent",
              chartType: "parameter-select",
              connectionId: "conn-neo4j-001",
              query: "",
              settings: {
                title: "Director",
                chartOptions: {
                  parameterType: "select",
                  parameterName: "test_director",
                  seedQuery:
                    "MATCH (p:Person)-[:DIRECTED]->(m:Movie) RETURN DISTINCT p.name AS value, p.name AS label ORDER BY p.name",
                },
              },
            },
            {
              id: "cascade-child",
              chartType: "parameter-select",
              connectionId: "conn-neo4j-001",
              query: "",
              settings: {
                title: "Movie by Director",
                chartOptions: {
                  parameterType: "cascading-select",
                  parameterName: "test_dir_movie",
                  parentParameterName: "test_director",
                  seedQuery:
                    "MATCH (p:Person)-[:DIRECTED]->(m:Movie) WHERE p.name = $param_test_director RETURN m.title AS value, m.title AS label ORDER BY m.title",
                },
              },
            },
            {
              id: "cascade-table",
              chartType: "table",
              connectionId: "conn-neo4j-001",
              query:
                "MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) WHERE m.title = $param_test_dir_movie RETURN p.name AS actor, r.roles AS roles",
              settings: {
                title: "Cast",
                chartOptions: {},
              },
            },
          ],
          gridLayout: [
            { i: "cascade-parent", x: 0, y: 0, w: 4, h: 2 },
            { i: "cascade-child", x: 4, y: 0, w: 4, h: 2 },
            { i: "cascade-table", x: 0, y: 2, w: 12, h: 4 },
          ],
        },
      ],
    };

    const putRes = await request.put(`/api/dashboards/${id}`, {
      data: { layoutJson: layout },
    });
    if (!putRes.ok()) throw new Error(`Update dashboard failed: ${putRes.status()}`);

    return {
      id,
      cleanup: async () => { await request.delete(`/api/dashboards/${id}`); },
    };
  }

  test("cascading-select depends on parent and re-fetches options", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createCascadingSelectDashboard(page.request);

    try {
      await page.goto(`/${id}`);

      // Wait for the parent select widget to load
      await expect(page.getByText("Select a value…").first()).toBeVisible({
        timeout: 15_000,
      });

      // The cascading child should show "Select test_director first…"
      await expect(page.getByText("Select test_director first…")).toBeVisible();

      // The "depends on" label should be visible
      await expect(page.getByText("depends on test_director")).toBeVisible();

      // Select a director from the parent dropdown
      await page.getByText("Select a value…").first().click();
      await expect(async () => {
        await page.getByRole("option").first().click({ timeout: 2_000 });
      }).toPass({ timeout: 15_000 });

      // After selecting the parent, the child should no longer show the
      // "Select test_director first…" placeholder — it should either show
      // "Select a value…" (options loaded) or be loading
      await expect(page.getByText("Select test_director first…")).not.toBeVisible({
        timeout: 10_000,
      });

      // The cascading child should now show "Select a value…"
      await expect(page.getByText("Select a value…")).toBeVisible({ timeout: 10_000 });

      // Select a movie from the cascading child
      await page.getByText("Select a value…").click();
      await expect(async () => {
        await page.getByRole("option").first().click({ timeout: 2_000 });
      }).toPass({ timeout: 15_000 });

      // The dependent table should execute without errors
      await expect(page.locator("text=Query Failed")).not.toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Action rules — multi-rule editor (extended coverage)
// ---------------------------------------------------------------------------

test.describe("Action rules — multi-rule editor", () => {
  test("should add multiple action rules and configure navigate-to-page", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(60_000);
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Multi Action ${Date.now()}`,
    );

    try {
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible({ timeout: 15_000 });

      // Add a second page for navigate-to-page
      await page.getByRole("button", { name: "Add page" }).click();
      await expect(page.getByText("Page 2")).toBeVisible({ timeout: 5_000 });

      // Add a table widget
      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });

      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "Data Table" }).click();
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      // Wait for editor to be ready after connection selection
      await expect(dialog.locator("[data-testid='codemirror-container']")).toBeVisible({
        timeout: 5_000,
      });

      // Write query and run
      await typeInEditor(dialog, page,
        "MATCH (m:Movie) RETURN m.title AS title, m.released AS released LIMIT 10"
      );
      await expect(dialog.getByTitle("Run query (Ctrl+Enter / \u2318+Enter)")).toBeEnabled({ timeout: 10_000 });
      await dialog.getByTitle("Run query (Ctrl+Enter / \u2318+Enter)").click();
      await expect(getPreview(dialog)).toBeVisible({ timeout: 15_000 });

      // Navigate to Advanced tab and enable click action
      await dialog.getByRole("tab", { name: "Advanced" }).click();
      await dialog.getByLabel("Enable click action").click();

      // Open action rules editor
      await dialog.getByRole("button", { name: "Manage Action Rules" }).click();
      const rulesDialog = page.getByRole("dialog", { name: "Action Rules" });

      // Add first rule — change to "Navigate to Page"
      await rulesDialog.getByRole("button", { name: "Add Rule" }).click();
      await expect(rulesDialog.getByText("Rule 1")).toBeVisible();

      // Change action type to Navigate to Page
      await rulesDialog.getByLabel("Action Type").click();
      await page.getByRole("option", { name: "Navigate to Page" }).click();

      // Should show Target Page selector with Page 2
      await expect(rulesDialog.getByText("Target Page")).toBeVisible({ timeout: 5_000 });

      // Add second rule — Set Parameter & Navigate
      await rulesDialog.getByRole("button", { name: "Add Rule" }).click();
      await expect(rulesDialog.getByText("Rule 2")).toBeVisible();

      // Done
      await rulesDialog.getByRole("button", { name: "Done" }).click();

      // Verify rule count
      await dialog.getByRole("tab", { name: "Advanced" }).click();
      await expect(dialog.getByText("2 action rule(s) configured.")).toBeVisible();

      await dialog.getByRole("button", { name: "Cancel" }).click();
    } finally {
      await cleanup();
    }
  });

  test("should delete an action rule", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(60_000);
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Delete Action ${Date.now()}`,
    );

    try {
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });

      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      // Wait for editor to be ready after connection selection
      await expect(dialog.locator("[data-testid='codemirror-container']")).toBeVisible({
        timeout: 5_000,
      });

      await typeInEditor(dialog, page,
        "MATCH (m:Movie) RETURN m.title AS title, m.released AS released LIMIT 5"
      );
      await expect(dialog.getByTitle("Run query (Ctrl+Enter / \u2318+Enter)")).toBeEnabled({ timeout: 10_000 });
      await dialog.getByTitle("Run query (Ctrl+Enter / \u2318+Enter)").click();
      await expect(getPreview(dialog)).toBeVisible({ timeout: 15_000 });

      await dialog.getByRole("tab", { name: "Advanced" }).click();
      await dialog.getByLabel("Enable click action").click();
      await dialog.getByRole("button", { name: "Manage Action Rules" }).click();

      const rulesDialog = page.getByRole("dialog", { name: "Action Rules" });

      // Add 2 rules
      await rulesDialog.getByRole("button", { name: "Add Rule" }).click();
      await expect(rulesDialog.getByText("Rule 1")).toBeVisible();
      await rulesDialog.getByRole("button", { name: "Add Rule" }).click();
      await expect(rulesDialog.getByText("Rule 2")).toBeVisible();

      // Delete Rule 1
      await rulesDialog.getByRole("button", { name: "Delete rule 1" }).click();

      // Should now show only 1 rule
      await expect(rulesDialog.getByText("Rule 2")).not.toBeVisible();
      await expect(rulesDialog.getByText("Rule 1")).toBeVisible();

      // Done
      await rulesDialog.getByRole("button", { name: "Done" }).click();
      await dialog.getByRole("tab", { name: "Advanced" }).click();
      await expect(dialog.getByText("1 action rule(s) configured.")).toBeVisible();

      await dialog.getByRole("button", { name: "Cancel" }).click();
    } finally {
      await cleanup();
    }
  });

  test("should show trigger column selector for table type", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(60_000);
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Trigger Col ${Date.now()}`,
    );

    try {
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });

      // Select Data Table
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "Data Table" }).click();
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      // Wait for editor to be ready after connection selection
      await expect(dialog.locator("[data-testid='codemirror-container']")).toBeVisible({
        timeout: 5_000,
      });

      await typeInEditor(dialog, page,
        "MATCH (m:Movie) RETURN m.title AS title, m.released AS released LIMIT 5"
      );
      await expect(dialog.getByTitle("Run query (Ctrl+Enter / \u2318+Enter)")).toBeEnabled({ timeout: 10_000 });
      await dialog.getByTitle("Run query (Ctrl+Enter / \u2318+Enter)").click();
      await expect(getPreview(dialog)).toBeVisible({ timeout: 15_000 });

      await dialog.getByRole("tab", { name: "Advanced" }).click();
      await dialog.getByLabel("Enable click action").click();
      await dialog.getByRole("button", { name: "Manage Action Rules" }).click();

      const rulesDialog = page.getByRole("dialog", { name: "Action Rules" });

      // Add a rule — table type should show "Trigger Column"
      await rulesDialog.getByRole("button", { name: "Add Rule" }).click();
      await expect(rulesDialog.getByText("Trigger Column")).toBeVisible({ timeout: 5_000 });
      // Source Field should NOT appear for table type
      await expect(rulesDialog.getByText("Source Field")).not.toBeVisible();

      await rulesDialog.getByRole("button", { name: "Done" }).click();
      await dialog.getByRole("button", { name: "Cancel" }).click();
    } finally {
      await cleanup();
    }
  });
});

test.describe("Preview Run button", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("Run button is visible in preview column from all tabs", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Preview Run ${Date.now()}`,
    );
    dashboardCleanup = cleanup;

    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select connection
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Run button should be visible on Data tab
    const runButton = dialog.getByRole("button", { name: "Run" });
    // There may be two Run buttons (one in query editor, one in preview column)
    // The preview column one should always be visible
    await expect(runButton.first()).toBeVisible();

    // Switch to Style tab — Run button in preview column should still be visible
    await dialog.getByRole("tab", { name: "Style" }).click();
    await expect(runButton.first()).toBeVisible();

    // Switch to Advanced tab — Run button in preview column should still be visible
    await dialog.getByRole("tab", { name: "Advanced" }).click();
    await expect(runButton.first()).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
  });
});

test.describe("Parameter bar filter toggle", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("filter button in toolbar toggles parameter bar visibility", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);

    // Create a dashboard via API with a click-action table widget
    const res = await page.request.post("/api/dashboards", {
      data: { name: `FilterToggle ${Date.now()}` },
    });
    const { id } = await res.json();
    dashboardCleanup = async () => { await page.request.delete(`/api/dashboards/${id}`); };

    const layout = {
      version: 2 as const,
      pages: [{
        id: "p1",
        title: "Main",
        widgets: [{
          id: "w1",
          chartType: "table",
          connectionId: "conn-neo4j-001",
          query: "MATCH (m:Movie) RETURN m.title AS title, m.released AS released ORDER BY m.title LIMIT 10",
          settings: {
            title: "Movies",
            clickAction: {
              type: "set-parameter" as const,
              parameterMapping: { parameterName: "selected_movie", sourceField: "" },
            },
          },
        }],
        gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 6 }],
      }],
    };
    await page.request.put(`/api/dashboards/${id}`, { data: { layoutJson: layout } });

    // Navigate to view mode
    await page.goto(`/${id}`);
    await expect(page.getByText("Movies")).toBeVisible({ timeout: 15_000 });

    // Wait for table data to load and click a cell to set a parameter
    const firstCell = page.locator("td").first();
    await expect(firstCell).toBeVisible({ timeout: 15_000 });
    await firstCell.click();

    // Parameter bar should appear with "Reset" button
    await expect(page.getByRole("button", { name: "Reset" })).toBeVisible({ timeout: 10_000 });

    // Filter button should be visible in the toolbar showing "Filters"
    const filterBtn = page.getByRole("button", { name: "Hide parameters" });
    await expect(filterBtn).toBeVisible();

    // Click the filter button to hide the parameter bar
    await filterBtn.click();

    // Parameter bar "Reset" button should be hidden
    await expect(page.getByRole("button", { name: "Reset" })).not.toBeVisible();

    // Filter button text should now show count (e.g. "Filters (1)")
    const showBtn = page.getByRole("button", { name: "Show parameters" });
    await expect(showBtn).toBeVisible();

    // Click filter button again to show the parameter bar
    await showBtn.click();
    await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
  });
});

test.describe("Param-select searchable default", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("param-select defaults to searchable (Command popover with search input)", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Searchable Default ${Date.now()}`,
    );
    dashboardCleanup = cleanup;

    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select "Parameter Selector" chart type
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Parameter Selector" }).click();

    // Select Neo4j connection
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Fill seed query
    await dialog.locator("#seed-query").fill(
      "MATCH (m:Movie) RETURN DISTINCT m.released ORDER BY m.released LIMIT 10"
    );

    // Set parameter name
    const paramInput = dialog.getByLabel("Parameter Name");
    await expect(paramInput).toBeVisible({ timeout: 5_000 });
    await paramInput.fill("year_searchable_default");

    // Add widget WITHOUT toggling the searchable option — it should be on by default
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // The widget should render a combobox button (searchable ParamSelector),
    // not a basic Radix Select trigger.
    // The combobox button is rendered by ParamSelector when searchable=true.
    const combobox = page.getByRole("combobox").last();
    await expect(combobox).toBeVisible({ timeout: 10_000 });
    await combobox.click();

    // The Command popover should show a search input with placeholder "Search…"
    await expect(page.getByPlaceholder("Search\u2026")).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Parameter collision warning", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Collision ${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("shows collision banner when two param-select widgets share the same parameter name", async ({
    page,
  }) => {
    // --- Widget 1: param-select with name "season" ---
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog1 = page.getByRole("dialog", { name: "Add Widget" });
    await dialog1.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Parameter Selector" }).click();
    await dialog1.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await dialog1.locator("#seed-query").fill("RETURN 1 AS x");
    const paramInput1 = dialog1.getByLabel("Parameter Name");
    await expect(paramInput1).toBeVisible({ timeout: 5_000 });
    await paramInput1.fill("season");
    await dialog1.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog1).not.toBeVisible();

    // --- Widget 2: param-select with the same name "season" ---
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog2 = page.getByRole("dialog", { name: "Add Widget" });
    await dialog2.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Parameter Selector" }).click();
    await dialog2.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await dialog2.locator("#seed-query").fill("RETURN 1 AS x");
    const paramInput2 = dialog2.getByLabel("Parameter Name");
    await expect(paramInput2).toBeVisible({ timeout: 5_000 });
    await paramInput2.fill("season");

    // The collision banner should appear
    await expect(
      dialog2.getByTestId("param-collision-banner")
    ).toBeVisible({ timeout: 5_000 });
  });
});
