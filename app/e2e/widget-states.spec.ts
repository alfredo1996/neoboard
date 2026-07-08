import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  typeInEditor,
} from "./fixtures";

test.describe("Widget editor", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    // Create a fresh dashboard to avoid test pollution from other specs.
    // Await POST before asserting URL to avoid the create-then-wait race.
    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const dialog = page.getByRole("dialog", { name: "Create Dashboard" });
    await dialog.locator("#dashboard-name").fill("Widget States Test");
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/dashboards") &&
          r.request().method() === "POST" &&
          r.status() === 201,
        { timeout: 10_000 },
      ),
      dialog.getByRole("button", { name: "Create" }).click(),
    ]);
    await page.waitForURL(/\/edit/, { timeout: 15_000 });
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
      await expect(
        dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
      ).toBeEnabled({ timeout: 10_000 });
      await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();

      // Should show error indicator (icon button with aria-label describing the error)
      await expect(
        dialog.getByRole("button", { name: /query failed/i }),
      ).toBeVisible({ timeout: 15_000 });
    });

    test("chart type selector shows all chart types", async ({ page }) => {
      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });

      // The modal should show Connection and Chart Type selectors
      await expect(
        dialog.locator("label").filter({ hasText: "Connection" }).first(),
      ).toBeVisible();
      await expect(
        dialog.getByText("Chart Type", { exact: true }),
      ).toBeVisible();

      // Query editor should be immediately visible
      await expect(
        dialog.locator("[data-testid='codemirror-container']"),
      ).toBeVisible();

      // Open the chart type dropdown (2nd combobox)
      await dialog.getByRole("combobox").nth(1).click();

      // All standard chart types should be in the dropdown options
      await expect(
        page.getByRole("option", { name: "Bar Chart" }),
      ).toBeVisible();
      await expect(
        page.getByRole("option", { name: "Line Chart" }),
      ).toBeVisible();
      await expect(
        page.getByRole("option", { name: "Pie Chart" }),
      ).toBeVisible();
      await expect(
        page.getByRole("option", { name: "Data Table" }),
      ).toBeVisible();
      await expect(page.getByRole("option", { name: "Graph" })).toBeVisible();
      await expect(
        page.getByRole("option", { name: "Map", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("option", { name: "Single Value" }),
      ).toBeVisible();
      await expect(
        page.getByRole("option", { name: "JSON Viewer" }),
      ).toBeVisible();
      await expect(page.getByRole("option", { name: "Form" })).toBeVisible();

      // v0.8 chart types
      await expect(page.getByRole("option", { name: "Gauge" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Sankey" })).toBeVisible();
      await expect(
        page.getByRole("option", { name: "Sunburst" }),
      ).toBeVisible();
      // Disabled in the picker (#1158) — implementations kept, not offered.
      await expect(page.getByRole("option", { name: /^radar$/i })).toHaveCount(
        0,
      );
      await expect(page.getByRole("option", { name: /treemap/i })).toHaveCount(
        0,
      );
      await expect(
        page.getByRole("option", { name: /choropleth/i }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("option", { name: /circle pack/i }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("option", { name: "Markdown" }),
      ).toBeVisible();
      await expect(page.getByRole("option", { name: "iFrame" })).toBeVisible();

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

      await typeInEditor(
        dialog,
        page,
        "MATCH (m:Movie) RETURN m.title LIMIT 3",
      );

      await expect(
        dialog.getByRole("button", { name: "Add Widget" }),
      ).toBeEnabled({ timeout: 10_000 });
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
        page.getByRole("menuitem", { name: "Edit Widget" }),
      ).toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: "Remove" }),
      ).toBeVisible();
    });
  });
});

test.describe("Widget without connection", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("widget without connection shows 'No connection configured'", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);

    // Create a test dashboard via API
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `No Connection ${Date.now()}`,
    );
    dashboardCleanup = cleanup;

    // Add a widget with empty connectionId via the API
    await page.request.put(`/api/dashboards/${id}`, {
      data: {
        layoutJson: {
          version: 2,
          pages: [
            {
              id: "p1",
              title: "Main",
              widgets: [
                {
                  id: "w1",
                  chartType: "table",
                  connectionId: "",
                  query: "MATCH (m:Movie) RETURN m.title LIMIT 5",
                  settings: { title: "Broken Widget" },
                },
              ],
              gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 5 }],
            },
          ],
        },
      },
    });

    // Navigate to the dashboard (view mode)
    await page.goto(`/${id}`);

    // Assert "No connection configured" is visible on the widget
    await expect(page.getByText("No connection configured")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("view-mode query error shows a generic message, not the raw driver error (#1050)", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);

    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Broken Query ${Date.now()}`,
    );
    dashboardCleanup = cleanup;

    // A real PG connection + a deliberately invalid query → the driver returns
    // a raw syntax error that must NOT reach a viewer.
    await page.request.put(`/api/dashboards/${id}`, {
      data: {
        layoutJson: {
          version: 2,
          pages: [
            {
              id: "p1",
              title: "Main",
              widgets: [
                {
                  id: "w1",
                  chartType: "table",
                  connectionId: "conn-pg-001",
                  query:
                    "SELECT zzz_no_such_column FROM definitely_not_a_table",
                  settings: { title: "Broken Widget" },
                },
              ],
              gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 5 }],
            },
          ],
        },
      },
    });

    // View mode (not /edit).
    await page.goto(`/${id}`);

    await expect(page.getByText("Query Failed")).toBeVisible({
      timeout: 15_000,
    });
    // Generic, sanitized copy — no raw driver/relation details.
    await expect(page.getByText(/couldn.t load its data/i)).toBeVisible();
    await expect(
      page.getByText(/definitely_not_a_table|does not exist|syntax error/i),
    ).toHaveCount(0);
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
    const { id } = (await res.json()).data;
    dashboardCleanup = async () => {
      await page.request.delete(`/api/dashboards/${id}`);
    };

    await page.request.put(`/api/dashboards/${id}`, {
      data: {
        layoutJson: {
          version: 2,
          pages: [
            {
              id: "p1",
              title: "Main",
              widgets: [
                {
                  id: "w1",
                  chartType: "table",
                  connectionId: "conn-neo4j-001",
                  query: "MATCH (m:Movie) RETURN m.title AS title LIMIT 5",
                  settings: {
                    title: "Movies",
                    chartOptions: { showRefreshButton: true },
                  },
                },
              ],
              gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 5 }],
            },
          ],
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

    // Click refresh — should trigger a new /api/query request
    const queryPromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/query") && resp.status() === 200,
      { timeout: 15_000 },
    );
    await refreshBtn.click();
    await queryPromise;
    await expect(page.locator("td").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Query Failed")).not.toBeVisible();
  });
});

test.describe("Empty result set — No data UX", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  async function createWidgetDashboard(
    request: import("@playwright/test").APIRequestContext,
    chartType: string,
    query: string,
  ) {
    const res = await request.post("/api/dashboards", {
      data: { name: `Empty ${chartType} ${Date.now()}` },
    });
    const { id } = (await res.json()).data;
    await request.put(`/api/dashboards/${id}`, {
      data: {
        layoutJson: {
          version: 2,
          pages: [
            {
              id: "p1",
              title: "Page 1",
              widgets: [
                {
                  id: "w1",
                  chartType,
                  connectionId: "conn-neo4j-001",
                  query,
                  settings: { title: `Empty ${chartType}` },
                },
              ],
              gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 4 }],
            },
          ],
        },
      },
    });
    return {
      id,
      cleanup: async () => {
        await request.delete(`/api/dashboards/${id}`);
      },
    };
  }

  const EMPTY_QUERY = "MATCH (n:NonExistentLabel__E2E) RETURN n.name LIMIT 1";

  test("bar chart with empty result renders without error", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createWidgetDashboard(
      page.request,
      "bar",
      EMPTY_QUERY,
    );
    dashboardCleanup = cleanup;

    await page.goto(`/${id}`);
    const widget = page.locator("[data-testid='widget-card']");
    await expect(widget).toBeVisible({ timeout: 15_000 });
    // Empty bar chart now renders a DOM, screen-reader-readable "No data"
    // status instead of only an ECharts canvas title (#1053).
    await expect(widget.getByTestId("bar-chart-empty")).toBeVisible({
      timeout: 15_000,
    });
    await expect(widget.getByText("No data")).toBeVisible();
    await expect(page.getByText("Query Failed")).not.toBeVisible();
    await expect(page.getByText("Incompatible data format")).not.toBeVisible();
  });

  test("table with empty result shows 'No results'", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createWidgetDashboard(
      page.request,
      "table",
      EMPTY_QUERY,
    );
    dashboardCleanup = cleanup;

    await page.goto(`/${id}`);
    // Table widget renders its own empty state ("No results") via DataGrid
    await expect(page.getByText("No results")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Query Failed")).not.toBeVisible();
  });

  test("single-value with empty result shows fallback value", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createWidgetDashboard(
      page.request,
      "single-value",
      EMPTY_QUERY,
    );
    dashboardCleanup = cleanup;

    await page.goto(`/${id}`);
    const widget = page.locator("[data-testid='widget-card']");
    await expect(widget).toBeVisible({ timeout: 15_000 });
    // Single-value renders "0" as fallback when no data returned
    await expect(widget.getByText("0")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Query Failed")).not.toBeVisible();
  });

  test("pie chart with empty result renders without error", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createWidgetDashboard(
      page.request,
      "pie",
      EMPTY_QUERY,
    );
    dashboardCleanup = cleanup;

    await page.goto(`/${id}`);
    const widget = page.locator("[data-testid='widget-card']");
    await expect(widget).toBeVisible({ timeout: 15_000 });
    await expect(widget.locator("canvas")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Query Failed")).not.toBeVisible();
    await expect(page.getByText("Incompatible data format")).not.toBeVisible();
  });

  test("graph widget with empty result shows 'No graph data'", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createWidgetDashboard(
      page.request,
      "graph",
      EMPTY_QUERY,
    );
    dashboardCleanup = cleanup;

    await page.goto(`/${id}`);
    await expect(page.getByText("No graph data")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Query Failed")).not.toBeVisible();
  });

  test("empty state is distinct from error state", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createWidgetDashboard(
      page.request,
      "table",
      EMPTY_QUERY,
    );
    dashboardCleanup = cleanup;

    await page.goto(`/${id}`);
    // Table renders DOM-visible "No results" — verifiable text
    await expect(page.getByText("No results")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Query Failed")).not.toBeVisible();
    await expect(page.getByText("Incompatible data format")).not.toBeVisible();
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
    const { id } = (await res.json()).data;
    dashboardCleanup = async () => {
      await page.request.delete(`/api/dashboards/${id}`);
    };

    await page.request.put(`/api/dashboards/${id}`, {
      data: {
        layoutJson: {
          version: 2,
          pages: [
            {
              id: "p1",
              title: "Main",
              widgets: [
                {
                  id: "w1",
                  chartType: "table",
                  connectionId: "conn-neo4j-001",
                  query: "MATCH (m:Movie) RETURN m.title AS title LIMIT 5",
                  settings: {
                    title: "Manual Table",
                    chartOptions: { manualRun: true },
                  },
                },
              ],
              gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 5 }],
            },
          ],
        },
      },
    });

    await page.goto(`/${id}`);
    await expect(page.getByText("Manual Table")).toBeVisible({
      timeout: 15_000,
    });

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
    const { id } = (await res.json()).data;
    dashboardCleanup = async () => {
      await page.request.delete(`/api/dashboards/${id}`);
    };

    await page.request.put(`/api/dashboards/${id}`, {
      data: {
        layoutJson: {
          version: 2,
          pages: [
            {
              id: "p1",
              title: "Main",
              widgets: [
                {
                  id: "w1",
                  chartType: "table",
                  connectionId: "conn-neo4j-001",
                  query: "MATCH (m:Movie) RETURN m.title AS title LIMIT 5",
                  settings: {
                    title: "Forever Cache",
                    chartOptions: {
                      cacheMode: "forever",
                      showRefreshButton: false,
                    },
                  },
                },
              ],
              gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 5 }],
            },
          ],
        },
      },
    });

    await page.goto(`/${id}`);
    await expect(page.getByText("Forever Cache")).toBeVisible({
      timeout: 15_000,
    });

    // Data should load
    await expect(page.locator("td").first()).toBeVisible({ timeout: 15_000 });

    // Refresh button should be visible even though showRefreshButton is false
    const widgetCard = page.getByTestId("widget-card").first();
    const refreshBtn = widgetCard.getByRole("button", { name: "Refresh" });
    await expect(refreshBtn).toBeVisible({ timeout: 10_000 });

    // Click refresh — should trigger a new /api/query request
    const queryPromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/query") && resp.status() === 200,
      { timeout: 15_000 },
    );
    await refreshBtn.click();
    await queryPromise;
    await expect(page.locator("td").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Query Failed")).not.toBeVisible();
  });
});
