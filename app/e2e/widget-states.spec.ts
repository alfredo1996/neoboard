import { test, expect, ALICE, createTestDashboard, typeInEditor } from "./fixtures";

test.describe("Widget editor", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    // Create a fresh dashboard to avoid test pollution from other specs
    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const dialog = page.getByRole("dialog", { name: "Create Dashboard" });
    await dialog.locator("#dashboard-name").fill("Widget States Test");
    await dialog.getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/\/edit/, { timeout: 10_000 });
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.describe("uncovered states", () => {
    test("should show preview error for invalid query", async ({ page }) => {
      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });

      // Select connection (Bar Chart is default)
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      // Enter an invalid query into the CodeMirror editor
      await typeInEditor(dialog, page, "THIS IS NOT VALID CYPHER !!!");

      // Run the query
      await expect(dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)")).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();

      // Should show error
      await expect(
        dialog.getByText(/failed|error|invalid|syntax/i).first()
      ).toBeVisible({ timeout: 15_000 });
    });

    test("chart type selector shows all chart types", async ({ page }) => {
      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });

      // The modal should show Connection and Chart Type selectors
      await expect(dialog.locator("label").filter({ hasText: "Connection" }).first()).toBeVisible();
      await expect(dialog.getByText("Chart Type", { exact: true })).toBeVisible();

      // Query editor should be immediately visible
      await expect(dialog.locator("[data-testid='codemirror-container']")).toBeVisible();

      // Open the chart type dropdown (2nd combobox)
      await dialog.getByRole("combobox").nth(1).click();

      // All standard chart types should be in the dropdown options
      await expect(page.getByRole("option", { name: "Bar Chart" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Line Chart" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Pie Chart" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Data Table" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Graph" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Map" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Single Value" })).toBeVisible();
      await expect(page.getByRole("option", { name: "JSON Viewer" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Form" })).toBeVisible();

      // Close by pressing Escape
      await page.keyboard.press("Escape");
    });
  });

  test.describe("actions menu", () => {
    test("widget card should show actions menu with edit and remove", async ({
      page,
    }) => {
      // Add a widget first
      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "Data Table" }).click();
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      await typeInEditor(dialog, page, "MATCH (m:Movie) RETURN m.title LIMIT 3");

      await expect(dialog.getByRole("button", { name: "Add Widget" })).toBeEnabled({ timeout: 10_000 });
      await dialog.getByRole("button", { name: "Add Widget" }).click();
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });

      // Open widget actions menu
      const actionsBtn = page
        .getByRole("button", { name: "Widget actions" })
        .last();
      await expect(actionsBtn).toBeVisible({ timeout: 10_000 });
      await actionsBtn.click();

      // Should show Edit and Remove menu items
      await expect(
        page.getByRole("menuitem", { name: "Edit" })
      ).toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: "Remove" })
      ).toBeVisible();
    });
  });
});

test.describe("Refresh button", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("widget with showRefreshButton shows refresh button and click re-fetches", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const res = await page.request.post("/api/dashboards", {
      data: { name: `Refresh ${Date.now()}` },
    });
    const { id } = await res.json();
    dashboardCleanup = async () => { await page.request.delete(`/api/dashboards/${id}`); };

    await page.request.put(`/api/dashboards/${id}`, {
      data: {
        layoutJson: {
          version: 2,
          pages: [{
            id: "p1",
            title: "Main",
            widgets: [{
              id: "w1",
              chartType: "table",
              connectionId: "conn-neo4j-001",
              query: "MATCH (m:Movie) RETURN m.title AS title LIMIT 5",
              settings: {
                title: "Movies",
                chartOptions: { showRefreshButton: true },
              },
            }],
            gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 5 }],
          }],
        },
      },
    });

    await page.goto(`/${id}`);
    await expect(page.getByText("Movies")).toBeVisible({ timeout: 15_000 });

    // Refresh button should be visible in the widget card header
    const widgetCard = page.getByTestId("widget-card").first();
    const refreshBtn = widgetCard.getByRole("button", { name: "Refresh" });
    await expect(refreshBtn).toBeVisible({ timeout: 10_000 });

    // Wait for data to load first
    await expect(page.locator("td").first()).toBeVisible({ timeout: 15_000 });

    // Intercept /api/query requests to detect a real re-fetch
    let queryCount = 0;
    await page.route("**/api/query", (route) => {
      queryCount++;
      return route.continue();
    });

    // Click refresh — should trigger a new /api/query request
    await refreshBtn.click();
    await expect(page.locator("td").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Query Failed")).not.toBeVisible();
    expect(queryCount).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Manual run mode", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("widget with manualRun shows overlay and executes on click", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const res = await page.request.post("/api/dashboards", {
      data: { name: `ManualRun ${Date.now()}` },
    });
    const { id } = await res.json();
    dashboardCleanup = async () => { await page.request.delete(`/api/dashboards/${id}`); };

    await page.request.put(`/api/dashboards/${id}`, {
      data: {
        layoutJson: {
          version: 2,
          pages: [{
            id: "p1",
            title: "Main",
            widgets: [{
              id: "w1",
              chartType: "table",
              connectionId: "conn-neo4j-001",
              query: "MATCH (m:Movie) RETURN m.title AS title LIMIT 5",
              settings: {
                title: "Manual Table",
                chartOptions: { manualRun: true },
              },
            }],
            gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 5 }],
          }],
        },
      },
    });

    await page.goto(`/${id}`);
    await expect(page.getByText("Manual Table")).toBeVisible({ timeout: 15_000 });

    // Manual-run overlay should be visible
    const overlay = page.getByTestId("manual-run-overlay");
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await expect(overlay.getByText("Query execution is paused.")).toBeVisible();

    // Click "Run Query"
    await overlay.getByRole("button", { name: "Run Query" }).click();

    // Overlay should disappear and data should load
    await expect(overlay).not.toBeVisible({ timeout: 10_000 });
    await expect(page.locator("td").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Query Failed")).not.toBeVisible();
  });
});

test.describe("Cache forever mode", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("widget with cacheMode 'forever' shows refresh button even when showRefreshButton is false", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const res = await page.request.post("/api/dashboards", {
      data: { name: `CacheForever ${Date.now()}` },
    });
    const { id } = await res.json();
    dashboardCleanup = async () => { await page.request.delete(`/api/dashboards/${id}`); };

    await page.request.put(`/api/dashboards/${id}`, {
      data: {
        layoutJson: {
          version: 2,
          pages: [{
            id: "p1",
            title: "Main",
            widgets: [{
              id: "w1",
              chartType: "table",
              connectionId: "conn-neo4j-001",
              query: "MATCH (m:Movie) RETURN m.title AS title LIMIT 5",
              settings: {
                title: "Forever Cache",
                chartOptions: { cacheMode: "forever", showRefreshButton: false },
              },
            }],
            gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 5 }],
          }],
        },
      },
    });

    await page.goto(`/${id}`);
    await expect(page.getByText("Forever Cache")).toBeVisible({ timeout: 15_000 });

    // Data should load
    await expect(page.locator("td").first()).toBeVisible({ timeout: 15_000 });

    // Refresh button should be visible even though showRefreshButton is false
    const widgetCard = page.getByTestId("widget-card").first();
    const refreshBtn = widgetCard.getByRole("button", { name: "Refresh" });
    await expect(refreshBtn).toBeVisible({ timeout: 10_000 });

    // Intercept /api/query requests to detect a real re-fetch
    let queryCount = 0;
    await page.route("**/api/query", (route) => {
      queryCount++;
      return route.continue();
    });

    // Click refresh — should trigger a new /api/query request
    await refreshBtn.click();
    await expect(page.locator("td").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Query Failed")).not.toBeVisible();
    expect(queryCount).toBeGreaterThanOrEqual(1);
  });
});
