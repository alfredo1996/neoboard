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

test.describe("Graph-dense dashboard — WebGL context management (#1052)", () => {
  let cleanup: (() => Promise<void>) | undefined;

  test.afterEach(async () => {
    await cleanup?.();
  });

  test("off-screen graphs lazy-mount and no WebGL context-loss errors fire", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(120_000);
    await authPage.login(ALICE.email, ALICE.password);

    const webglErrors: string[] = [];
    page.on("console", (msg) => {
      const t = msg.text();
      if (/context lost|too many active webgl/i.test(t)) webglErrors.push(t);
    });

    const { id, cleanup: c } = await createTestDashboard(
      page.request,
      `Graph Dense ${Date.now()}`,
    );
    cleanup = c;

    // Several tall graph widgets stacked vertically — most start below the fold.
    const N = 4;
    const query =
      "MATCH (p:Person)-[r:ACTED_IN]->(m:Movie) RETURN p, r, m LIMIT 10";
    const widgets = Array.from({ length: N }, (_, i) => ({
      id: `g${i}`,
      chartType: "graph",
      connectionId: "conn-neo4j-001",
      query,
      settings: { title: `Graph ${i}` },
    }));
    const gridLayout = Array.from({ length: N }, (_, i) => ({
      i: `g${i}`,
      x: 0,
      y: i * 12,
      w: 12,
      h: 12,
    }));
    await page.request.put(`/api/dashboards/${id}`, {
      data: {
        layoutJson: {
          version: 2,
          pages: [{ id: "p1", title: "Main", widgets, gridLayout }],
        },
      },
    });

    await page.goto(`/${id}`);

    const fitButtons = page.getByRole("button", { name: "Fit graph" });
    // The first graph (in view) mounts and NVL renders its toolbar.
    await expect(fitButtons.first()).toBeVisible({ timeout: 45_000 });

    // Off-screen graphs are gated — not all N are mounted at once. This bounds
    // how many WebGL contexts are live regardless of how many graph widgets the
    // dashboard has.
    expect(await fitButtons.count()).toBeLessThan(N);

    // The bottom graph isn't mounted yet (it's below the fold).
    const lastCard = page.locator("[data-testid='widget-card']").last();
    await expect(
      lastCard.getByRole("button", { name: "Fit graph" }),
    ).toHaveCount(0);

    // Scrolling it into view mounts it (earlier graphs may unmount to free
    // their contexts — the live count stays bounded).
    await lastCard.scrollIntoViewIfNeeded();
    await expect(
      lastCard.getByRole("button", { name: "Fit graph" }),
    ).toBeVisible({ timeout: 45_000 });

    // Never exhausted the browser's WebGL contexts.
    expect(webglErrors, webglErrors.join("\n")).toHaveLength(0);
  });
});
