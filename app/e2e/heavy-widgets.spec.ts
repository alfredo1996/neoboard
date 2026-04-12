import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  typeInEditor,
  getPreview,
} from "./fixtures";

test.describe("Heavy widget rendering", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Heavy Widgets ${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  // ── Pie ─────────────────────────────────────────────────────────────

  test("pie chart — renders canvas and adds to dashboard", async ({ page }) => {
    test.setTimeout(60_000);
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Pie Chart" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();

    await typeInEditor(
      dialog,
      page,
      "MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();

    const preview = getPreview(dialog);
    await expect(preview.locator("canvas")).toBeVisible({ timeout: 15_000 });

    // Add to dashboard and verify it renders on the grid
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("[data-testid='widget-card'] canvas"),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("pie chart — scalar query shows incompatible data format", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Pie Chart" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();

    await typeInEditor(dialog, page, "RETURN 42 AS scalar");
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();

    await expect(dialog.getByText("Incompatible data format")).toBeVisible({
      timeout: 10_000,
    });
  });

  // ── Map ─────────────────────────────────────────────────────────────

  test("map chart — renders Leaflet container with markers", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Map", exact: true }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();

    await typeInEditor(
      dialog,
      page,
      "UNWIND range(1,5) AS i RETURN 40.0+i AS lat, -73.0+i AS lng, 'Point ' + i AS name",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();

    const preview = getPreview(dialog);
    await expect(preview.locator(".leaflet-container")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      preview.locator(".leaflet-overlay-pane svg").first(),
    ).toBeVisible({ timeout: 10_000 });

    // Add to dashboard and verify Leaflet renders on the grid
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("[data-testid='widget-card'] .leaflet-container"),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("map chart — pan/zoom interaction does not crash", async ({ page }) => {
    test.setTimeout(60_000);
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Map", exact: true }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();

    await typeInEditor(
      dialog,
      page,
      "UNWIND range(1,5) AS i RETURN 40.0+i AS lat, -73.0+i AS lng, 'Point ' + i AS name",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();

    const preview = getPreview(dialog);
    const mapContainer = preview.locator(".leaflet-container");
    await expect(mapContainer).toBeVisible({ timeout: 15_000 });

    // Zoom in and out via Leaflet controls — should not crash
    const zoomIn = preview.locator(".leaflet-control-zoom-in");
    await expect(zoomIn).toBeVisible({ timeout: 5_000 });
    await zoomIn.click();
    await expect(mapContainer).toBeVisible();

    const zoomOut = preview.locator(".leaflet-control-zoom-out");
    await zoomOut.click();
    await expect(mapContainer).toBeVisible();

    // Tile pane should still contain loaded tiles
    await expect(preview.locator(".leaflet-tile-pane img").first()).toBeVisible(
      { timeout: 10_000 },
    );

    // No errors should have appeared
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();
    await expect(
      dialog.getByText("Incompatible data format"),
    ).not.toBeVisible();
  });

  test("map chart — scalar query shows incompatible data format", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Map", exact: true }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();

    await typeInEditor(dialog, page, "RETURN 42 AS scalar");
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();

    await expect(dialog.getByText("Incompatible data format")).toBeVisible({
      timeout: 10_000,
    });
  });

  // ── Graph ───────────────────────────────────────────────────────────

  test("graph chart — renders nodes and Fit graph interaction works", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Graph" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();

    await typeInEditor(
      dialog,
      page,
      "MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) RETURN p, r, m LIMIT 10",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();

    const preview = getPreview(dialog);
    await expect(preview).toBeVisible({ timeout: 15_000 });

    // Graph toolbar proves NVL rendered successfully
    const fitBtn = dialog.getByRole("button", { name: "Fit graph" });
    await expect(fitBtn).toBeVisible({ timeout: 10_000 });

    // Click Fit graph — should not crash
    await fitBtn.click();
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();

    // Add to dashboard
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Fit graph" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("graph chart — scalar query shows incompatible data format", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Graph" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();

    await typeInEditor(dialog, page, "RETURN 42 AS scalar");
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();

    await expect(dialog.getByText("Incompatible data format")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      dialog.getByRole("button", { name: "Fit graph" }),
    ).not.toBeVisible();
  });
});
