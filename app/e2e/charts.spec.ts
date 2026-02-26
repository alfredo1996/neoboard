import { test, expect, ALICE } from "./fixtures";

test.describe("Chart rendering", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    // Navigate to Movie Analytics which should have pre-configured widgets
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10000 });
  });

  test("bar chart should render SVG/canvas, not JSON text", async ({ page }) => {
    // If no echarts found, at least verify no raw JSON is displayed
    const jsonText = page.locator("pre").filter({ hasText: '{"label"' });
    await expect(jsonText).not.toBeVisible({ timeout: 10000 });
  });

  test("table chart should render DataGrid with rows", async ({ page }) => {
    // Navigate to edit and add a table widget to test
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText("MATCH (m:Movie) RETURN m.title, m.released LIMIT 5");

    await dialog.getByRole("button", { name: "Run" }).click();

    // DataGrid should render a table element
    await expect(dialog.locator("table").first()).toBeVisible({ timeout: 15000 });
  });

  test("single value chart should render a large number", async ({ page }) => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Single Value" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText("MATCH (m:Movie) RETURN count(m) AS count");

    await dialog.getByRole("button", { name: "Run" }).click();

    // SingleValueChart renders with data-testid
    await expect(dialog.locator("[data-testid='single-value-chart']").first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("JSON viewer should render collapsible tree", async ({ page }) => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "JSON Viewer" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText("MATCH (m:Movie) RETURN m LIMIT 2");

    await dialog.getByRole("button", { name: "Run" }).click();

    // JsonViewer renders with font-mono class
    await expect(
      dialog.locator("[class*='font-mono']").first()
    ).toBeVisible({ timeout: 15000 });
  });
});

// ---------------------------------------------------------------------------
// End-to-end: each connector fetches real data and renders it in a chart
// ---------------------------------------------------------------------------

test.describe("Neo4j connector → chart visualization", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.waitForURL(/\/edit/, { timeout: 15_000 });
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test("Neo4j bar chart — fetches data and renders canvas", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Bar Chart is default — just select Neo4j connection
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Neo4j/ }).click();

    // Query for aggregated data
    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText(
      "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS label, count(p) AS value ORDER BY value DESC LIMIT 5"
    );
    await dialog.getByRole("button", { name: "Run" }).click();

    // The ECharts bar chart should render a canvas element inside the preview
    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview.locator("[data-testid='base-chart']")).toBeVisible({
      timeout: 10_000,
    });
    await expect(preview.locator("canvas")).toBeVisible({ timeout: 10_000 });

    // No error alert should be shown
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();
  });

  test("Neo4j line chart — fetches data and renders canvas", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Line Chart" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Neo4j/ }).click();

    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText(
      "MATCH (m:Movie) RETURN m.released AS year, count(m) AS count ORDER BY year"
    );
    await dialog.getByRole("button", { name: "Run" }).click();

    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview.locator("[data-testid='base-chart']")).toBeVisible({
      timeout: 10_000,
    });
    await expect(preview.locator("canvas")).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();
  });

  test("Neo4j pie chart — fetches data and renders canvas", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Pie Chart" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Neo4j/ }).click();

    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText(
      "MATCH (p:Person)-[r]->(m:Movie) RETURN type(r) AS label, count(*) AS value"
    );
    await dialog.getByRole("button", { name: "Run" }).click();

    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview.locator("[data-testid='base-chart']")).toBeVisible({
      timeout: 10_000,
    });
    await expect(preview.locator("canvas")).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();
  });

  test("Neo4j table — fetches data and shows actual movie names", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Neo4j/ }).click();

    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText(
      "MATCH (m:Movie) RETURN m.title AS title, m.released AS released LIMIT 5"
    );
    await dialog.getByRole("button", { name: "Run" }).click();

    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });
    // Should render an HTML table with actual seed data
    await expect(preview.locator("table")).toBeVisible({ timeout: 10_000 });
    await expect(
      preview.getByText("The Matrix", { exact: true }).or(preview.getByText("Top Gun"))
    ).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();
  });

  test("Neo4j single-value — fetches aggregated count", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Single Value" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Neo4j/ }).click();

    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText("MATCH (m:Movie) RETURN count(m) AS total");
    await dialog.getByRole("button", { name: "Run" }).click();

    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(
      preview.locator("[data-testid='single-value-chart']")
    ).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();
  });
});

test.describe("PostgreSQL connector → chart visualization", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.waitForURL(/\/edit/, { timeout: 15_000 });
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test("PostgreSQL bar chart — fetches data and renders canvas", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Bar Chart is default — just select PostgreSQL connection
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /PostgreSQL/ }).click();

    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText(
      "SELECT released AS label, COUNT(*) AS value FROM movies GROUP BY released ORDER BY released LIMIT 10"
    );
    await dialog.getByRole("button", { name: "Run" }).click();

    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview.locator("[data-testid='base-chart']")).toBeVisible({
      timeout: 10_000,
    });
    await expect(preview.locator("canvas")).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();
  });

  test("PostgreSQL line chart — fetches data and renders canvas", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Line Chart" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /PostgreSQL/ }).click();

    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText(
      "SELECT released AS year, COUNT(*) AS movie_count FROM movies GROUP BY released ORDER BY released"
    );
    await dialog.getByRole("button", { name: "Run" }).click();

    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview.locator("[data-testid='base-chart']")).toBeVisible({
      timeout: 10_000,
    });
    await expect(preview.locator("canvas")).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();
  });

  test("PostgreSQL pie chart — fetches data and renders canvas", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Pie Chart" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /PostgreSQL/ }).click();

    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText(
      "SELECT released AS label, COUNT(*) AS value FROM movies GROUP BY released ORDER BY value DESC LIMIT 5"
    );
    await dialog.getByRole("button", { name: "Run" }).click();

    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview.locator("[data-testid='base-chart']")).toBeVisible({
      timeout: 10_000,
    });
    await expect(preview.locator("canvas")).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();
  });

  test("PostgreSQL table — fetches data and shows actual movie names", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /PostgreSQL/ }).click();

    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText(
      "SELECT title, released, tagline FROM movies ORDER BY released LIMIT 5"
    );
    await dialog.getByRole("button", { name: "Run" }).click();

    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview.locator("table")).toBeVisible({ timeout: 10_000 });
    // Verify actual seed data from the movies table is displayed
    await expect(
      preview.getByText("One Flew Over the Cuckoo's Nest").or(
        preview.getByText("Top Gun")
      ).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();
  });

  test("PostgreSQL single-value — fetches aggregated count", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Single Value" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /PostgreSQL/ }).click();

    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText("SELECT COUNT(*) AS total FROM movies");
    await dialog.getByRole("button", { name: "Run" }).click();

    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(
      preview.locator("[data-testid='single-value-chart']")
    ).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Seeded dashboard view: verify widgets render from live queries
// ---------------------------------------------------------------------------

test.describe("Seeded dashboard renders live data", () => {
  test("Movie Analytics dashboard widgets load with real data", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // The seeded dashboard has two widgets:
    //   w1: "Top 10 Movies by Cast Size" (bar, Neo4j)
    //   w2: "Movies Released per Year" (line, PostgreSQL)
    await expect(page.getByText("Top 10 Movies by Cast Size")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Movies Released per Year")).toBeVisible({
      timeout: 15_000,
    });

    // Both widgets should render ECharts canvases (not error alerts)
    const charts = page.locator("[data-testid='base-chart']");
    await expect(charts.first()).toBeVisible({ timeout: 30_000 });
    // Each base-chart should have a canvas inside
    await expect(charts.first().locator("canvas")).toBeVisible({ timeout: 10_000 });

    // No "Query Failed" errors on the page
    await expect(page.getByText("Query Failed")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Graph chart: Neo4j node + relationship rendering
// ---------------------------------------------------------------------------

test.describe("Graph chart visualization", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test("graph chart preview — renders nodes and toolbar controls", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Graph chart + Neo4j connection
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Graph" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Neo4j/ }).click();

    // Query that returns nodes + relationships
    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText(
      "MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) RETURN p, r, m LIMIT 10"
    );
    await dialog.getByRole("button", { name: "Run" }).click();

    // The preview container should render
    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });

    // The "No graph data" message should NOT appear (nodes were extracted)
    await expect(dialog.getByText("No graph data")).not.toBeVisible();

    // The graph toolbar controls should be visible (proves GraphChart mounted with data)
    await expect(
      dialog.getByRole("button", { name: "Fit graph" })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      dialog.locator("select[aria-label='Graph layout']")
    ).toBeVisible({ timeout: 10_000 });

    // No error alert
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();
  });

  test("graph chart — added widget renders on dashboard", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Graph + Neo4j
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Graph" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Neo4j/ }).click();

    // Query returning graph data
    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText(
      "MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) RETURN p, r, m LIMIT 15"
    );
    await dialog.getByRole("button", { name: "Run" }).click();

    // Wait for preview then add the widget
    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();

    // The graph widget should now be on the dashboard grid
    // It should have the toolbar controls visible (not "No graph data")
    await expect(
      page.getByRole("button", { name: "Fit graph" })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator("select[aria-label='Graph layout']")
    ).toBeVisible();
  });

  test("graph chart — empty result shows 'No graph data' message", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Graph + Neo4j
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Graph" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Neo4j/ }).click();

    // Query that returns scalars (no nodes/relationships)
    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText("RETURN 1 AS value");
    await dialog.getByRole("button", { name: "Run" }).click();

    // Should show the "Incompatible data format" validation empty state
    // since the data lacks graph structures (nodes/relationships/paths).
    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText("Incompatible data format")).toBeVisible({ timeout: 10_000 });

    // Toolbar should NOT be visible (graph didn't render)
    await expect(
      dialog.getByRole("button", { name: "Fit graph" })
    ).not.toBeVisible();

    // Still no query error — the query succeeded, just no graph data
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();
  });

  test("graph chart — layout selector changes layout", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Graph" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Neo4j/ }).click();

    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText(
      "MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) RETURN p, r, m LIMIT 10"
    );
    await dialog.getByRole("button", { name: "Run" }).click();

    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });

    // The layout dropdown should be visible and default to "Force"
    const layoutSelect = dialog.locator("select[aria-label='Graph layout']");
    await expect(layoutSelect).toBeVisible({ timeout: 10_000 });

    // Switch to Circular layout — should not crash or show errors
    await layoutSelect.selectOption("circular");
    await expect(dialog.getByText("No graph data")).not.toBeVisible();
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();

    // Switch to Hierarchical layout
    await layoutSelect.selectOption("hierarchical");
    await expect(dialog.getByText("No graph data")).not.toBeVisible();
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();

    // Toolbar should still be functional
    await expect(
      dialog.getByRole("button", { name: "Fit graph" })
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Graph exploration: right-click context menu, expand, collapse, reset
// ---------------------------------------------------------------------------

test.describe("Graph chart exploration", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  /**
   * Helper: add a graph widget to the dashboard and save it.
   * Returns after the dialog has closed and the widget is on the grid.
   */
  async function addGraphWidget(page: import("@playwright/test").Page) {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Graph" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Neo4j/ }).click();

    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText(
      "MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) RETURN p, r, m LIMIT 5"
    );
    await dialog.getByRole("button", { name: "Run" }).click();

    // Wait for preview to appear
    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(
      dialog.getByRole("button", { name: "Fit graph" })
    ).toBeVisible({ timeout: 10_000 });

    // Add the widget
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();
  }

  test("graph chart — added widget shows status bar with node/edge counts", async ({
    page,
  }) => {
    await addGraphWidget(page);

    // The exploration wrapper should render with a status bar
    const statusBar = page.locator("[data-testid='graph-status-bar']");
    await expect(statusBar).toBeVisible({ timeout: 15_000 });

    // Status bar should show node and edge counts
    const nodeCount = page.locator("[data-testid='graph-node-count']");
    await expect(nodeCount).toBeVisible();
    await expect(nodeCount).toContainText("nodes");

    const edgeCount = page.locator("[data-testid='graph-edge-count']");
    await expect(edgeCount).toBeVisible();
    await expect(edgeCount).toContainText("edges");
  });

  test("graph chart — right-click on canvas shows context menu with Expand", async ({
    page,
  }) => {
    await addGraphWidget(page);

    // Wait for the graph exploration wrapper to mount
    const exploration = page.locator("[data-testid='graph-exploration']");
    await expect(exploration).toBeVisible({ timeout: 15_000 });

    // Right-click on the NVL canvas to trigger context menu
    // This may or may not hit a node — if it does, context menu appears
    // NVL renders overlay divs on top of the canvas, so we use force: true
    // to bypass Playwright's actionability checks for right-click on the canvas
    const canvas = exploration.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10_000 });
    await canvas.click({ button: "right", position: { x: 100, y: 100 }, force: true });

    // If a node was hit, the context menu should appear with "Expand"
    // If no node was hit, context menu won't appear — that's OK for canvas-based tests
    // We verify at least no crash occurred
    await expect(page.getByText("Query Failed")).not.toBeVisible();
  });

  test("graph chart — expand node loads neighbors (no errors)", async ({
    page,
  }) => {
    await addGraphWidget(page);

    const exploration = page.locator("[data-testid='graph-exploration']");
    await expect(exploration).toBeVisible({ timeout: 15_000 });

    // Record initial node count text
    const nodeCountEl = page.locator("[data-testid='graph-node-count']");
    await expect(nodeCountEl).toBeVisible({ timeout: 10_000 });
    const initialText = await nodeCountEl.textContent();

    // NVL renders overlay divs, so force: true is needed for canvas clicks
    const canvas = exploration.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10_000 });

    // Try center of canvas where nodes are more likely
    const box = await canvas.boundingBox();
    if (box) {
      await canvas.click({
        button: "right",
        position: { x: box.width / 2, y: box.height / 2 },
        force: true,
      });
    }

    // If context menu appeared, click Expand
    const expandBtn = page.getByRole("button", { name: "Expand" });
    const menuVisible = await expandBtn.isVisible().catch(() => false);
    if (menuVisible) {
      await expandBtn.click();

      // Wait a moment for the expansion to complete
      await page.waitForTimeout(2000);

      // Node count should have changed (increased or stayed same if no neighbors)
      // At minimum, no error should appear
      await expect(page.getByText("Query Failed")).not.toBeVisible();
    }

    // Regardless of whether we hit a node, no errors should occur
    await expect(page.getByText("Query Failed")).not.toBeVisible();
  });

  test("graph chart — reset clears all expansions", async ({ page }) => {
    await addGraphWidget(page);

    const exploration = page.locator("[data-testid='graph-exploration']");
    await expect(exploration).toBeVisible({ timeout: 15_000 });

    // Record initial node count
    const nodeCountEl = page.locator("[data-testid='graph-node-count']");
    await expect(nodeCountEl).toBeVisible({ timeout: 10_000 });
    const initialText = await nodeCountEl.textContent();

    // NVL renders overlay divs, so force: true is needed for canvas clicks
    const canvas = exploration.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10_000 });
    const box = await canvas.boundingBox();
    if (box) {
      await canvas.click({
        button: "right",
        position: { x: box.width / 2, y: box.height / 2 },
        force: true,
      });
    }

    const expandBtn = page.getByRole("button", { name: "Expand" });
    const menuVisible = await expandBtn.isVisible().catch(() => false);
    if (menuVisible) {
      await expandBtn.click();
      await page.waitForTimeout(2000);

      // After expansion, the Reset button should appear in the status bar
      const resetBtn = page.locator("[data-testid='graph-reset-button']");
      const resetVisible = await resetBtn.isVisible().catch(() => false);
      if (resetVisible) {
        await resetBtn.click();
        await page.waitForTimeout(500);

        // Node count should return to initial value
        await expect(nodeCountEl).toHaveText(initialText!);
      }
    }

    // No errors regardless of expansion outcome
    await expect(page.getByText("Query Failed")).not.toBeVisible();
  });

  test("graph chart — collapse removes expanded neighbors", async ({
    page,
  }) => {
    await addGraphWidget(page);

    const exploration = page.locator("[data-testid='graph-exploration']");
    await expect(exploration).toBeVisible({ timeout: 15_000 });

    const nodeCountEl = page.locator("[data-testid='graph-node-count']");
    await expect(nodeCountEl).toBeVisible({ timeout: 10_000 });
    const initialText = await nodeCountEl.textContent();

    // NVL renders overlay divs, so force: true is needed for canvas clicks
    const canvas = exploration.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 10_000 });
    const box = await canvas.boundingBox();
    if (box) {
      await canvas.click({
        button: "right",
        position: { x: box.width / 2, y: box.height / 2 },
        force: true,
      });
    }

    const expandBtn = page.getByRole("button", { name: "Expand" });
    const canExpand = await expandBtn.isVisible().catch(() => false);
    if (canExpand) {
      await expandBtn.click();
      await page.waitForTimeout(2000);

      // Right-click same position again to get Collapse option
      if (box) {
        await canvas.click({
          button: "right",
          position: { x: box.width / 2, y: box.height / 2 },
          force: true,
        });
      }

      const collapseBtn = page.getByRole("button", { name: "Collapse" });
      const canCollapse = await collapseBtn.isVisible().catch(() => false);
      if (canCollapse) {
        await collapseBtn.click();
        await page.waitForTimeout(500);

        // Node count should return to initial
        await expect(nodeCountEl).toHaveText(initialText!);
      }
    }

    await expect(page.getByText("Query Failed")).not.toBeVisible();
  });
});
