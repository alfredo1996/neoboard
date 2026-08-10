import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  typeInEditor,
} from "./fixtures";

// ---------------------------------------------------------------------------
// New chart types — creation flow tests
// ---------------------------------------------------------------------------
// These tests verify the end-to-end creation flow for each new chart type:
// Gauge, Sankey, Sunburst, Radar, Treemap, Gantt.
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
    await expect(
      page.getByRole("heading", { name: /^Editing:/ }),
    ).toBeVisible();
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
    await expect(
      dialog.getByRole("button", { name: "Add Widget" }),
    ).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  });

  test("does not offer disabled chart types in the picker (#1158)", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Neo4j connection first
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Open the chart-type picker
    await dialog.getByRole("combobox").nth(1).click();

    // The four disabled types (circle-packing, treemap, choropleth, radar)
    // must not appear as options — their implementations stay in the codebase
    // but they're not offered for new widgets.
    for (const rx of [/^radar$/i, /treemap/i, /choropleth/i, /circle pack/i]) {
      await expect(page.getByRole("option", { name: rx })).toHaveCount(0);
    }
    // A kept type is still offered (sanity check the picker is populated).
    await expect(page.getByRole("option", { name: "Sankey" })).toBeVisible();
  });

  test("chart-type dropdown scrolls with the mouse wheel inside the modal (#1160)", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Open the chart-type picker and wait for the options to render.
    await dialog.getByRole("combobox").nth(1).click();
    await expect(page.getByRole("option", { name: "Sankey" })).toBeVisible();
    const box = await page.evaluate(() => {
      // The scroll container is the [cmdk-list] that actually contains the
      // options (a bare [cmdk-list] querySelector can match an empty one).
      const opts = Array.from(
        document.querySelectorAll('[role="option"]'),
      ) as HTMLElement[];
      const sankey = opts.find((o) => /sankey/i.test(o.textContent || ""));
      const l = sankey?.closest("[cmdk-list]") as HTMLElement | null;
      if (!l) return null;
      l.scrollTop = 0;
      const r = l.getBoundingClientRect();
      return {
        x: Math.round(r.x + r.width / 2),
        y: Math.round(r.y + r.height / 2),
        scrollH: l.scrollHeight,
        clientH: l.clientHeight,
        canScroll: l.scrollHeight > l.clientHeight + 2,
      };
    });
    expect(box?.canScroll, `list dims: ${JSON.stringify(box)}`).toBe(true);

    // Wheel over the list — Radix Dialog's scroll-lock used to swallow this.
    await page.mouse.move(box!.x, box!.y);
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(250);

    const after = await page.evaluate(() => {
      const opts = Array.from(
        document.querySelectorAll('[role="option"]'),
      ) as HTMLElement[];
      const sankey = opts.find((o) => /sankey/i.test(o.textContent || ""));
      const l = sankey?.closest("[cmdk-list]") as HTMLElement | null;
      return l?.scrollTop ?? -1;
    });
    expect(after).toBeGreaterThan(40);
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

    await expect(
      dialog.getByRole("button", { name: "Add Widget" }),
    ).toBeEnabled({
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

    await expect(
      dialog.getByRole("button", { name: "Add Widget" }),
    ).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  });

  test("should create a Gantt widget", async ({ page }) => {
    test.setTimeout(60_000);

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Neo4j connection first
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Select Gantt chart type
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Gantt" }).click();

    // Type query — tasks with start/end timestamps
    await typeInEditor(
      dialog,
      page,
      "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH m.title AS task, m.released AS start, m.released + 2 AS end RETURN task, start, end LIMIT 8",
    );

    await expect(
      dialog.getByRole("button", { name: "Add Widget" }),
    ).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Seed dashboard — verify Widget Showcase renders correctly
// ---------------------------------------------------------------------------

test.describe("Widget Showcase seed dashboard", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    // Navigate to Widget Showcase dashboard
    await page.getByText("Widget Showcase", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
  });

  test("should render the Widget Showcase dashboard with widget cards", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // At least one widget card should be visible on the page
    await expect(
      page.locator("[data-testid='widget-card']").first(),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test("should show the Simple Charts page tab", async ({ page }) => {
    test.setTimeout(30_000);

    await expect(page.getByRole("tab", { name: "Simple Charts" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("should show the Rule-Based Styling page tab", async ({ page }) => {
    test.setTimeout(30_000);

    await expect(
      page.getByRole("tab", { name: "Rule-Based Styling" }),
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("should render widgets on the Simple Charts page", async ({ page }) => {
    test.setTimeout(60_000);

    // Click the Simple Charts page tab
    await page.getByRole("tab", { name: "Simple Charts" }).click();

    // Multiple widget cards should be present (bar, line, pie, single-value, table, gauge, radar, sankey, treemap, sunburst)
    await expect(
      page.locator("[data-testid='widget-card']").first(),
    ).toBeVisible({
      timeout: 15_000,
    });

    // At least 10 widgets should be on this page
    const widgetCount = await page
      .locator("[data-testid='widget-card']")
      .count();
    expect(widgetCount).toBeGreaterThanOrEqual(10);
  });

  test("should show Color Palettes page tab", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Color Palettes" })).toBeVisible(
      { timeout: 10_000 },
    );
  });
});
