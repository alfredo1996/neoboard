import { test, expect, ALICE, createTestDashboard, typeInEditor, getPreview } from "./fixtures";

// ---------------------------------------------------------------------------
// Design system — Deep Ocean palette, accessibility, colorblind mode
// ---------------------------------------------------------------------------

test.describe("Design system — Deep Ocean palette & accessibility", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    dashboardCleanup = undefined;
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Design System ${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.afterEach(async () => {
    const cleanup = dashboardCleanup;
    dashboardCleanup = undefined;
    await cleanup?.();
  });

  /**
   * Helper: add a bar chart widget with a Neo4j query and wait for it to render.
   * Returns the scoped dialog locator.
   */
  async function addBarChartWithData(page: import("@playwright/test").Page) {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Bar Chart is default — select Neo4j connection
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();

    await typeInEditor(
      dialog,
      page,
      "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS label, count(p) AS value ORDER BY value DESC LIMIT 5",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();

    const preview = getPreview(dialog);
    await expect(preview.locator("[data-testid='base-chart']")).toBeVisible({
      timeout: 15_000,
    });
    await expect(preview.locator("canvas")).toBeVisible({ timeout: 10_000 });

    return dialog;
  }

  // ── Deep Ocean palette ────────────────────────────────────────────────

  test("Deep Ocean CSS custom properties are defined (10 chart colors)", async ({
    page,
  }) => {
    // Read --chart-1 through --chart-10 from the document root
    const colors = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return Array.from({ length: 10 }, (_, i) =>
        style.getPropertyValue(`--chart-${i + 1}`).trim(),
      );
    });

    // All 10 should be non-empty HSL values
    for (let i = 0; i < 10; i++) {
      expect(colors[i], `--chart-${i + 1} should be defined`).toBeTruthy();
      expect(colors[i]).toMatch(/\d+\s+\d+%\s+\d+%/);
    }

    // First color should be Blue (hue ~217)
    expect(colors[0]).toContain("217");
  });

  test("Deep Ocean neutrals have blue tint (not pure gray)", async ({
    page,
  }) => {
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--background")
        .trim(),
    );
    // Deep Ocean light: hue ~210, not 0
    expect(bg).toMatch(/^2\d+\s/);
  });

  // ── Chart ARIA attributes ─────────────────────────────────────────────

  test("chart container has role='img' and auto-generated aria-label", async ({
    page,
  }) => {
    const dialog = await addBarChartWithData(page);
    const preview = getPreview(dialog);

    const chartEl = preview.locator("[data-testid='base-chart']");
    await expect(chartEl).toHaveAttribute("role", "img");
    // ECharts AriaComponent auto-generates a descriptive label from chart data
    await expect(chartEl).toHaveAttribute("aria-label", /This is a chart/);
  });

  // ── Colorblind mode toggle ────────────────────────────────────────────

  test("Colorblind Mode option appears in Style tab for bar chart", async ({
    page,
  }) => {
    const dialog = await addBarChartWithData(page);

    // Navigate to Style tab
    await dialog.getByRole("tab", { name: "Style" }).click();

    // Expand the Accessibility category (collapsed by default)
    await dialog.getByRole("button", { name: "Accessibility" }).click();

    // The "Colorblind Mode" switch should now be visible
    await expect(dialog.getByText("Colorblind Mode")).toBeVisible();
  });

  test("toggling Colorblind Mode re-renders chart (no crash)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const dialog = await addBarChartWithData(page);

    // Navigate to Style tab → Accessibility
    await dialog.getByRole("tab", { name: "Style" }).click();
    await dialog.getByRole("button", { name: "Accessibility" }).click();

    // Toggle colorblind mode on
    await dialog.locator("#colorblindMode").click();

    // Chart should still be visible (no crash, no error)
    const preview = getPreview(dialog);
    await expect(preview.locator("canvas")).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();

    // Toggle it off again
    await dialog.locator("#colorblindMode").click();
    await expect(preview.locator("canvas")).toBeVisible({ timeout: 10_000 });
  });

  // ── Line chart colorblind mode ────────────────────────────────────────

  test("Colorblind Mode option appears in Style tab for line chart", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Line Chart
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Line Chart" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();

    await typeInEditor(
      dialog,
      page,
      "MATCH (m:Movie) RETURN m.released AS x, count(m) AS y ORDER BY x",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();

    const preview = getPreview(dialog);
    await expect(preview.locator("canvas")).toBeVisible({ timeout: 15_000 });

    // Navigate to Style tab → Accessibility
    await dialog.getByRole("tab", { name: "Style" }).click();
    await dialog.getByRole("button", { name: "Accessibility" }).click();
    await expect(dialog.getByText("Colorblind Mode")).toBeVisible();
  });

  // ── Pie chart colorblind mode ─────────────────────────────────────────

  test("Colorblind Mode option appears in Style tab for pie chart", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Pie Chart
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Pie Chart" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();

    await typeInEditor(
      dialog,
      page,
      "MATCH (p:Person)-[r]->(m:Movie) RETURN type(r) AS name, count(*) AS value",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();

    const preview = getPreview(dialog);
    await expect(preview.locator("canvas")).toBeVisible({ timeout: 15_000 });

    // Navigate to Style tab → Accessibility
    await dialog.getByRole("tab", { name: "Style" }).click();
    await dialog.getByRole("button", { name: "Accessibility" }).click();
    await expect(dialog.getByText("Colorblind Mode")).toBeVisible();
  });

  // ── Non-ECharts types should NOT show colorblind mode ─────────────────

  test("Colorblind Mode does NOT appear for table chart type", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select Data Table
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();

    // Navigate to Style tab
    await dialog.getByRole("tab", { name: "Style" }).click();

    // "Accessibility" section should not exist
    await expect(
      dialog.getByRole("button", { name: "Accessibility" }),
    ).not.toBeVisible();
    await expect(dialog.getByText("Colorblind Mode")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Theme switching — light / dark / system
// ---------------------------------------------------------------------------

test.describe("Theme switching", () => {
  test.beforeEach(async ({ authPage, page }) => {
    // Clear any stored theme preference
    await authPage.login(ALICE.email, ALICE.password);
    await page.evaluate(() => localStorage.removeItem("neoboard-theme"));
  });

  test("system default follows OS dark → html has .dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => localStorage.removeItem("neoboard-theme"));
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("system default follows OS light → no .dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.evaluate(() => localStorage.removeItem("neoboard-theme"));
    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("theme dropdown has 3 options, System checked by default", async ({
    page,
  }) => {
    await page.evaluate(() => localStorage.removeItem("neoboard-theme"));
    await page.reload();
    // Open theme dropdown in sidebar
    await page.getByText("Theme").click();
    await expect(page.getByRole("menuitemradio", { name: "Light" })).toBeVisible();
    await expect(page.getByRole("menuitemradio", { name: "Dark" })).toBeVisible();
    await expect(page.getByRole("menuitemradio", { name: "System" })).toBeVisible();
    await expect(
      page.getByRole("menuitemradio", { name: "System" }),
    ).toHaveAttribute("data-state", "checked");
  });

  test("explicit Dark overrides OS light", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.reload();
    // Open theme dropdown and select Dark
    await page.getByText("Theme").click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("explicit Light overrides OS dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => localStorage.setItem("neoboard-theme", "light"));
    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("switching back to System re-follows OS", async ({ page }) => {
    // Start with explicit light
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => localStorage.setItem("neoboard-theme", "light"));
    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // Switch to System — should follow OS dark
    await page.getByText("Theme").click();
    await page.getByRole("menuitemradio", { name: "System" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
