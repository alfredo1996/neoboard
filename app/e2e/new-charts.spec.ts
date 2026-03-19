import { test, expect, ALICE, createTestDashboard, typeInEditor } from "./fixtures";

// ---------------------------------------------------------------------------
// New chart types (v0.8) — creation flow tests
// ---------------------------------------------------------------------------
// These tests verify the end-to-end creation flow for each new chart type:
// Gauge, Sankey, Sunburst, Radar, Treemap.
//
// We focus on the creation flow (dialog → query → add widget) rather than
// visual rendering details — chart rendering is verified by unit tests.
// ---------------------------------------------------------------------------

test.describe("New chart types — creation flow", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Charts ${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("should create a Gauge widget", async ({ page }) => {
    test.setTimeout(60_000);

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Neo4j connection first
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Select Gauge chart type
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Gauge" }).click();

    // Type query
    await typeInEditor(
      dialog,
      page,
      "MATCH (m:Movie) RETURN count(m) AS value, 'Movies' AS name",
    );

    // The Add Widget button should be enabled (no Run required for this flow)
    await expect(dialog.getByRole("button", { name: "Add Widget" })).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  });

  test("should create a Treemap widget", async ({ page }) => {
    test.setTimeout(60_000);

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Neo4j connection first
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Select Treemap chart type
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Treemap" }).click();

    // Type query
    await typeInEditor(
      dialog,
      page,
      "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH m, count(p) AS cast RETURN m.title AS name, cast AS value ORDER BY cast DESC LIMIT 10",
    );

    await expect(dialog.getByRole("button", { name: "Add Widget" })).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  });

  test("should create a Radar widget", async ({ page }) => {
    test.setTimeout(60_000);

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Neo4j connection first
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Select Radar chart type
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Radar" }).click();

    // Type query
    await typeInEditor(
      dialog,
      page,
      "MATCH (p:Person)-[r]->(m:Movie) WITH type(r) AS indicator, count(*) AS value RETURN indicator, value, 100 AS max",
    );

    await expect(dialog.getByRole("button", { name: "Add Widget" })).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  });

  test("should create a Sankey widget", async ({ page }) => {
    test.setTimeout(60_000);

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Neo4j connection first
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Select Sankey chart type
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Sankey" }).click();

    // Type query
    await typeInEditor(
      dialog,
      page,
      "MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) RETURN p.name AS source, m.title AS target, 1 AS value LIMIT 15",
    );

    await expect(dialog.getByRole("button", { name: "Add Widget" })).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  });

  test("should create a Sunburst widget", async ({ page }) => {
    test.setTimeout(60_000);

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Neo4j connection first
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Select Sunburst chart type
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Sunburst" }).click();

    // Type query
    await typeInEditor(
      dialog,
      page,
      "MATCH (p:Person)-[r]->(m:Movie) RETURN type(r) AS parent, m.title AS name, 1 AS value LIMIT 20",
    );

    await expect(dialog.getByRole("button", { name: "Add Widget" })).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Seed dashboard (dash-003) — verify Chart Showcase renders correctly
// ---------------------------------------------------------------------------

test.describe("Chart Showcase seed dashboard", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    // Navigate to Chart Showcase dashboard
    await page.getByText("Chart Showcase", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
  });

  test("should render the Chart Showcase dashboard with widget cards", async ({ page }) => {
    test.setTimeout(60_000);

    // At least one widget card should be visible on the page
    await expect(page.locator("[data-testid='widget-card']").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("should show the New Charts (Neo4j) page tab", async ({ page }) => {
    test.setTimeout(30_000);

    // The dashboard should have a "New Charts (Neo4j)" tab/page
    await expect(page.getByRole("tab", { name: "New Charts (Neo4j)" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("should show the New Charts (PostgreSQL) page tab", async ({ page }) => {
    test.setTimeout(30_000);

    // The dashboard should have a "New Charts (PostgreSQL)" tab/page
    await expect(page.getByRole("tab", { name: "New Charts (PostgreSQL)" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("should render Neo4j chart widgets on the New Charts (Neo4j) page", async ({ page }) => {
    test.setTimeout(60_000);

    // Click the Neo4j page tab
    await page.getByRole("tab", { name: "New Charts (Neo4j)" }).click();

    // Multiple widget cards should be present (gauge, treemap, radar, sankey, sunburst)
    await expect(page.locator("[data-testid='widget-card']").first()).toBeVisible({
      timeout: 15_000,
    });

    // At least 5 widgets should be on this page
    const widgetCount = await page.locator("[data-testid='widget-card']").count();
    expect(widgetCount).toBeGreaterThanOrEqual(5);
  });

  test("should render PostgreSQL chart widgets on the New Charts (PostgreSQL) page", async ({ page }) => {
    test.setTimeout(60_000);

    // Click the PostgreSQL page tab
    await page.getByRole("tab", { name: "New Charts (PostgreSQL)" }).click();

    // Multiple widget cards should be present (gauge, treemap, radar, sankey, pie)
    await expect(page.locator("[data-testid='widget-card']").first()).toBeVisible({
      timeout: 15_000,
    });

    // At least 5 widgets should be on this page
    const widgetCount = await page.locator("[data-testid='widget-card']").count();
    expect(widgetCount).toBeGreaterThanOrEqual(5);
  });
});
