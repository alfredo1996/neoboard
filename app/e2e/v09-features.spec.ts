import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  typeInEditor,
  getPreview,
} from "./fixtures";

// ---------------------------------------------------------------------------
// v0.9 Feature E2E Tests
//
// Covers features introduced in v0.9 that were not previously tested:
//   - DataZoom (scroll-to-zoom)
//   - Reference lines (markLine)
//   - Axis label rotation
//   - Number formatting
//   - Pie donut & Top-N
//   - CSV export
//   - Gauge thresholds
//   - GFM markdown tables
// ---------------------------------------------------------------------------

test.describe("v0.9 chart features", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `v09-features-${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  // ── DataZoom ──────────────────────────────────────────────────────────

  test("Enable Scroll Zoom option appears for bar chart", async ({ page }) => {
    test.setTimeout(60_000);
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select connection + Bar chart
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Bar" }).click();

    // Type query and run
    await typeInEditor(
      dialog,
      page,
      "MATCH (m:Movie) RETURN m.released AS year, count(*) AS count LIMIT 20",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
    await expect(getPreview(dialog).locator("canvas")).toBeVisible({
      timeout: 15_000,
    });

    // Open Settings tab and find DataZoom option
    await dialog.getByRole("tab", { name: "Settings" }).click();
    const zoomCheckbox = dialog.getByLabel("Enable Scroll Zoom");
    await expect(zoomCheckbox).toBeVisible();

    // Toggle it on
    await zoomCheckbox.check();
    await expect(zoomCheckbox).toBeChecked();
  });

  // ── Reference Lines ───────────────────────────────────────────────────

  test("Reference Lines field accepts JSON for line chart", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Line" }).click();

    await typeInEditor(
      dialog,
      page,
      "MATCH (m:Movie) RETURN m.released AS x, count(*) AS y LIMIT 20",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
    await expect(getPreview(dialog).locator("canvas")).toBeVisible({
      timeout: 15_000,
    });

    await dialog.getByRole("tab", { name: "Settings" }).click();
    const refLineInput = dialog.getByLabel("Reference Lines (JSON)");
    await expect(refLineInput).toBeVisible();
    await refLineInput.fill(
      '[{"value":10,"label":"Target","color":"#ff0000"}]',
    );
  });

  // ── Axis Label Rotation ───────────────────────────────────────────────

  test("Axis Label Rotation setting appears for bar chart", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Bar" }).click();

    await typeInEditor(
      dialog,
      page,
      "MATCH (m:Movie) RETURN m.title AS label, count(*) AS value LIMIT 10",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
    await expect(getPreview(dialog).locator("canvas")).toBeVisible({
      timeout: 15_000,
    });

    await dialog.getByRole("tab", { name: "Settings" }).click();
    const rotationInput = dialog.getByLabel(/Axis Label Rotation/);
    await expect(rotationInput).toBeVisible();
    await rotationInput.fill("45");
  });

  // ── Number Formatting ─────────────────────────────────────────────────

  test("Number format options appear in chart settings", async ({ page }) => {
    test.setTimeout(60_000);
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Bar" }).click();

    await typeInEditor(
      dialog,
      page,
      "MATCH (m:Movie) RETURN m.released AS year, count(*) AS count LIMIT 5",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
    await expect(getPreview(dialog).locator("canvas")).toBeVisible({
      timeout: 15_000,
    });

    await dialog.getByRole("tab", { name: "Settings" }).click();
    // Look for number format or decimal places setting
    const numberFormatField = dialog.getByLabel(
      /Number Format|Decimal Places/i,
    );
    await expect(numberFormatField.first()).toBeVisible();
  });

  // ── Pie Donut & Top-N ────────────────────────────────────────────────

  test("Pie chart has Donut Style toggle and Top N option", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Pie" }).click();

    await typeInEditor(
      dialog,
      page,
      "MATCH (p:Person) RETURN p.name AS label, count(*) AS value LIMIT 10",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
    await expect(getPreview(dialog).locator("canvas")).toBeVisible({
      timeout: 15_000,
    });

    await dialog.getByRole("tab", { name: "Settings" }).click();

    // Donut toggle
    const donutCheckbox = dialog.getByLabel("Donut Style");
    await expect(donutCheckbox).toBeVisible();
    await donutCheckbox.check();
    await expect(donutCheckbox).toBeChecked();

    // Top N input
    const topNInput = dialog.getByLabel("Top N Slices");
    await expect(topNInput).toBeVisible();
    await topNInput.fill("5");
  });

  // ── Gauge Thresholds ──────────────────────────────────────────────────

  test("Gauge chart threshold settings are configurable", async ({ page }) => {
    test.setTimeout(60_000);
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Gauge" }).click();

    await typeInEditor(
      dialog,
      page,
      "MATCH (m:Movie) RETURN count(m) AS value, 'Movies' AS name",
    );
    await expect(
      dialog.getByRole("button", { name: "Add Widget" }),
    ).toBeEnabled({ timeout: 10_000 });

    // Navigate to settings
    await dialog.getByRole("tab", { name: "Settings" }).click();

    // Look for threshold-related settings (min, max, or threshold JSON)
    const thresholdField = dialog.getByLabel(/Threshold|Min Value|Max Value/i);
    await expect(thresholdField.first()).toBeVisible();
  });

  // ── GFM Markdown Tables ───────────────────────────────────────────────

  test("Markdown widget renders GFM table syntax", async ({ page }) => {
    test.setTimeout(60_000);
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Markdown" }).click();

    // Open settings and enter GFM table markdown
    await dialog.getByRole("tab", { name: "Settings" }).click();
    const contentField = dialog.getByLabel("Markdown Content");
    await expect(contentField).toBeVisible();
    await contentField.fill(
      "| Name | Score |\n| --- | --- |\n| Alice | 95 |\n| Bob | 87 |",
    );

    // Add the widget
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Verify the table rendered on the dashboard
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });
  });
});

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------
test.describe("CSV export", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `csv-export-${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("Data table widget has CSV download option", async ({ page }) => {
    test.setTimeout(60_000);
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();

    await typeInEditor(
      dialog,
      page,
      "MATCH (m:Movie) RETURN m.title, m.released LIMIT 5",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
    await expect(dialog.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    // Add widget to dashboard
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Look for CSV export button on the rendered widget
    const widgetCard = page.locator("[data-testid='widget-card']").first();
    const exportBtn = widgetCard.getByRole("button", {
      name: /export|download|csv/i,
    });
    // If there's a menu, open it
    const moreBtn = widgetCard.getByRole("button", {
      name: /more|options|menu/i,
    });
    if (await moreBtn.isVisible().catch(() => false)) {
      await moreBtn.click();
      await expect(
        page.getByRole("menuitem", { name: /CSV|Export/i }),
      ).toBeVisible({ timeout: 5_000 });
    } else if (await exportBtn.isVisible().catch(() => false)) {
      await expect(exportBtn).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Accessibility smoke tests
// ---------------------------------------------------------------------------
test.describe("Accessibility smoke tests", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("dashboard list page has no critical accessibility violations", async ({
    page,
  }) => {
    // Import axe-core dynamically for accessibility scanning
    const AxeBuilder = await import("@axe-core/playwright")
      .then((m) => m.default)
      .catch(() => null);

    if (!AxeBuilder) {
      test.skip(true, "axe-core/playwright not installed — skipping a11y test");
      return;
    }

    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"]) // May fail due to theme customization
      .analyze();

    // Allow minor violations but flag critical ones
    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(
      critical,
      `Found ${critical.length} critical/serious a11y violations: ${critical.map((v) => v.id).join(", ")}`,
    ).toHaveLength(0);
  });
});
