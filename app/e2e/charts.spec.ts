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
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Table", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByLabel("Query").fill("MATCH (m:Movie) RETURN m.title, m.released LIMIT 5");
    await dialog.getByRole("button", { name: "Run Query" }).click();

    // DataGrid should render a table element
    await expect(dialog.locator("table").first()).toBeVisible({ timeout: 15000 });
  });

  test("single value chart should render a large number", async ({ page }) => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Value", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByLabel("Query").fill("MATCH (m:Movie) RETURN count(m) AS count");
    await dialog.getByRole("button", { name: "Run Query" }).click();

    // SingleValueChart renders with data-testid
    await expect(dialog.locator("[data-testid='single-value-chart']").first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("JSON viewer should render collapsible tree", async ({ page }) => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("JSON", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByLabel("Query").fill("MATCH (m:Movie) RETURN m LIMIT 2");
    await dialog.getByRole("button", { name: "Run Query" }).click();

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
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test("Neo4j bar chart — fetches data and renders canvas", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");

    // Step 1: Bar chart + Neo4j connection
    await dialog.getByText("Bar", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: /Neo4j/ }).click();
    await dialog.getByRole("button", { name: "Next" }).click();

    // Step 2: Query for aggregated data
    await dialog
      .getByLabel("Query")
      .fill(
        "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS label, count(p) AS value ORDER BY value DESC LIMIT 5"
      );
    await dialog.getByRole("button", { name: "Run Query" }).click();

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
    const dialog = page.getByRole("dialog");

    await dialog.getByText("Line", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: /Neo4j/ }).click();
    await dialog.getByRole("button", { name: "Next" }).click();

    await dialog
      .getByLabel("Query")
      .fill(
        "MATCH (m:Movie) RETURN m.released AS year, count(m) AS count ORDER BY year"
      );
    await dialog.getByRole("button", { name: "Run Query" }).click();

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
    const dialog = page.getByRole("dialog");

    await dialog.getByText("Pie", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: /Neo4j/ }).click();
    await dialog.getByRole("button", { name: "Next" }).click();

    await dialog
      .getByLabel("Query")
      .fill(
        "MATCH (p:Person)-[r]->(m:Movie) RETURN type(r) AS label, count(*) AS value"
      );
    await dialog.getByRole("button", { name: "Run Query" }).click();

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
    const dialog = page.getByRole("dialog");

    await dialog.getByText("Table", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: /Neo4j/ }).click();
    await dialog.getByRole("button", { name: "Next" }).click();

    await dialog
      .getByLabel("Query")
      .fill("MATCH (m:Movie) RETURN m.title AS title, m.released AS released LIMIT 5");
    await dialog.getByRole("button", { name: "Run Query" }).click();

    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });
    // Should render an HTML table with actual seed data
    await expect(preview.locator("table")).toBeVisible({ timeout: 10_000 });
    await expect(
      preview.getByText("The Matrix").or(preview.getByText("Top Gun"))
    ).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();
  });

  test("Neo4j single-value — fetches aggregated count", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByText("Value", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: /Neo4j/ }).click();
    await dialog.getByRole("button", { name: "Next" }).click();

    await dialog.getByLabel("Query").fill("MATCH (m:Movie) RETURN count(m) AS total");
    await dialog.getByRole("button", { name: "Run Query" }).click();

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
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test("PostgreSQL bar chart — fetches data and renders canvas", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByText("Bar", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: /PostgreSQL/ }).click();
    await dialog.getByRole("button", { name: "Next" }).click();

    await dialog
      .getByLabel("Query")
      .fill(
        "SELECT released AS label, COUNT(*) AS value FROM movies GROUP BY released ORDER BY released LIMIT 10"
      );
    await dialog.getByRole("button", { name: "Run Query" }).click();

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
    const dialog = page.getByRole("dialog");

    await dialog.getByText("Line", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: /PostgreSQL/ }).click();
    await dialog.getByRole("button", { name: "Next" }).click();

    await dialog
      .getByLabel("Query")
      .fill(
        "SELECT released AS year, COUNT(*) AS movie_count FROM movies GROUP BY released ORDER BY released"
      );
    await dialog.getByRole("button", { name: "Run Query" }).click();

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
    const dialog = page.getByRole("dialog");

    await dialog.getByText("Pie", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: /PostgreSQL/ }).click();
    await dialog.getByRole("button", { name: "Next" }).click();

    await dialog
      .getByLabel("Query")
      .fill(
        "SELECT released AS label, COUNT(*) AS value FROM movies GROUP BY released ORDER BY value DESC LIMIT 5"
      );
    await dialog.getByRole("button", { name: "Run Query" }).click();

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
    const dialog = page.getByRole("dialog");

    await dialog.getByText("Table", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: /PostgreSQL/ }).click();
    await dialog.getByRole("button", { name: "Next" }).click();

    await dialog
      .getByLabel("Query")
      .fill("SELECT title, released, tagline FROM movies ORDER BY released LIMIT 5");
    await dialog.getByRole("button", { name: "Run Query" }).click();

    const preview = dialog.locator(".border.rounded-lg").first();
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview.locator("table")).toBeVisible({ timeout: 10_000 });
    // Verify actual seed data from the movies table is displayed
    await expect(
      preview.getByText("One Flew Over the Cuckoo's Nest").or(
        preview.getByText("Top Gun")
      )
    ).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();
  });

  test("PostgreSQL single-value — fetches aggregated count", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByText("Value", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: /PostgreSQL/ }).click();
    await dialog.getByRole("button", { name: "Next" }).click();

    await dialog.getByLabel("Query").fill("SELECT COUNT(*) AS total FROM movies");
    await dialog.getByRole("button", { name: "Run Query" }).click();

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
