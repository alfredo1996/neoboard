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
// Gauge, Sankey, Sunburst, Radar, Gantt.
//
// We focus on the creation flow (dialog → query → add widget) rather than
// visual rendering details — chart rendering is verified by unit tests.
// ---------------------------------------------------------------------------

/**
 * The widget exists and rendered something.
 *
 * Three of these tests used to end at `expect(dialog).not.toBeVisible()` — the
 * modal closing. A failed POST, a transform that throws, or a chart type that
 * never mounts all leave that assertion green while dropping the widget on the
 * floor (#1635).
 */
async function expectWidgetRendered(page: import("@playwright/test").Page) {
  const card = page.locator("[data-testid='widget-card']").first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  // role="img" is what BaseChart puts on a mounted chart.
  await expect(card.getByRole("img").first()).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText("Chart failed to render")).not.toBeVisible();
  await expect(card.getByText("Incompatible data format")).not.toBeVisible();
}

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
    await expectWidgetRendered(page);
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

    // Radar and choropleth stay registered but disabled in the picker (#1158);
    // treemap and circle packing are not registered in the app at all (#1687).
    // None of the four may be offered for new widgets.
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
    await expectWidgetRendered(page);
  });

  test("should draw a Sankey whose result contains a self-loop (#1656)", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Sankey" }).click();

    // The demo's shape: one ordinary flow plus a row whose source and target
    // are the same node. That row alone used to make echarts throw "Sankey is
    // a DAG, the original data has cycle!" over the whole widget. The seeded
    // Chart Playground that produces it is a demo showcase and is not present
    // in the E2E database (see app/e2e/param-defaults.spec.ts:10-11), so the
    // shape is reproduced inline.
    await typeInEditor(
      dialog,
      page,
      "UNWIND [['Europe','Asia'],['Oceania','Oceania']] AS r RETURN r[0] AS source, r[1] AS target, 1 AS value",
    );

    await expect(
      dialog.getByRole("button", { name: "Add Widget" }),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expectWidgetRendered(page);

    // The self-loop row is dropped whole — two nodes, one link.
    await expect(
      page.getByRole("img", {
        name: "Sankey diagram with 2 nodes and 1 links",
      }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("should report a cyclic Sankey instead of the echarts throw (#1656)", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Sankey" }).click();

    await typeInEditor(
      dialog,
      page,
      "UNWIND [['A','B'],['B','A']] AS r RETURN r[0] AS source, r[1] AS target, 1 AS value",
    );

    await expect(dialog.getByText("Incompatible data format")).toBeVisible({
      timeout: 15_000,
    });
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
    await expectWidgetRendered(page);
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

    // Real dates. Neo4j hands a date() over as 'YYYY-MM-DD' (#1616).
    await typeInEditor(
      dialog,
      page,
      "UNWIND [['Design', date('2026-04-01'), date('2026-04-03')], ['Build', date('2026-04-03'), date('2026-04-10')]] AS r RETURN r[0] AS task, r[1] AS start, r[2] AS end",
    );

    await expect(
      dialog.getByRole("button", { name: "Add Widget" }),
    ).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByRole("img", { name: "Gantt chart with 2 tasks" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("should reject a year column as gantt dates", async ({ page }) => {
    test.setTimeout(60_000);

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Gantt" }).click();

    // `released` is a year. It used to reach the chart as 1 999 000 ms —
    // a cluster of invisible bars in January 1970 (#1616).
    await typeInEditor(
      dialog,
      page,
      "MATCH (m:Movie) RETURN m.title AS task, m.released AS start, m.released + 2 AS end LIMIT 8",
    );

    await expect(dialog.getByText("Incompatible data format")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("should create a Gantt widget with the time zoom switched off (#1686)", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Gantt" }).click();

    // Datetimes, the shape the slider labels were getting wrong.
    await typeInEditor(
      dialog,
      page,
      "UNWIND [['Design', datetime('2026-04-01T09:00:00'), datetime('2026-04-03T17:30:00')], ['Build', datetime('2026-04-03T10:00:00'), datetime('2026-04-10T16:00:00')]] AS r RETURN r[0] AS task, r[1] AS start, r[2] AS end",
    );

    // The option lives in the Style tab under its own, collapsed category.
    await dialog.getByRole("tab", { name: "Style" }).click();
    await dialog.getByRole("button", { name: "Interaction" }).click();
    const toggle = dialog.locator("#enableDataZoom");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await expect(
      dialog.getByRole("button", { name: "Add Widget" }),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Save, reload, reopen. The chart's aria-label reads the same whether
    // the option is on, off, or never persisted (the slider is canvas), so
    // the round-trip editor → layout JSON → editor is what this pins — the
    // one leg the unit tests do not cover.
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("Dashboard saved", { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByRole("heading", { name: /^Editing:/ })).toBeVisible({
      timeout: 15_000,
    });

    const card = page.locator("[data-testid='widget-card']").first();
    await expect(
      card.getByRole("img", { name: "Gantt chart with 2 tasks" }),
    ).toBeVisible({ timeout: 15_000 });
    await card.hover();
    await card.getByRole("button", { name: "Widget actions" }).click();
    await page.getByRole("menuitem", { name: /edit/i }).click();

    const editDialog = page.getByRole("dialog", { name: "Edit Widget" });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });
    await editDialog.getByRole("tab", { name: "Style" }).click();
    await editDialog.getByRole("button", { name: "Interaction" }).click();
    await expect(editDialog.locator("#enableDataZoom")).toHaveAttribute(
      "aria-checked",
      "false",
    );
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

  test("a column-scoped styling rule paints only its own column", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // Seeded through the API rather than the styling editor: this is about
    // what reaches the DOM, and driving six form controls to get there would
    // be testing the editor instead.
    const conns = await page.request.get("/api/connections");
    const pg = (
      (await conns.json()).data as { id: string; type: string }[]
    ).find((c) => c.type === "postgresql");
    expect(pg, "no PostgreSQL connection seeded").toBeTruthy();

    const created = await page.request.post("/api/dashboards", {
      data: { name: `Column-scoped rules ${Date.now()}` },
    });
    const { id } = (await created.json()).data;
    await page.request.put(`/api/dashboards/${id}`, {
      data: {
        layoutJson: {
          version: 2,
          pages: [
            {
              id: "p1",
              title: "Page 1",
              widgets: [
                {
                  id: "scoped",
                  chartType: "table",
                  connectionId: pg!.id,
                  query:
                    "SELECT title AS product, released AS margin FROM movies ORDER BY released DESC LIMIT 5",
                  settings: {
                    title: "Scoped rule",
                    stylingConfig: {
                      enabled: true,
                      rules: [
                        {
                          id: "r1",
                          column: "margin",
                          operator: ">",
                          value: 0,
                          color: "rgb(22, 163, 74)",
                          target: "color",
                        },
                      ],
                    },
                  },
                },
              ],
              gridLayout: [{ i: "scoped", x: 0, y: 0, w: 12, h: 8 }],
            },
          ],
        },
      },
    });

    await page.goto(`/${id}`);
    const grid = page.locator("[data-testid='widget-card'] table");
    await expect(grid.first()).toBeVisible({ timeout: 20_000 });

    // Every rule used to merge into one row-level style, so the product name
    // went green along with the margin (#1418).
    const row = grid.locator("tbody tr").first();
    const cells = row.locator("td");
    const colours = await cells.evaluateAll((tds) =>
      tds.map((td) => getComputedStyle(td).color),
    );
    expect(colours.filter((c) => c === "rgb(22, 163, 74)")).toHaveLength(1);
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

    // Multiple widget cards should be present (bar, line, pie, single-value, table, gauge, radar, sankey, sunburst)
    await expect(
      page.locator("[data-testid='widget-card']").first(),
    ).toBeVisible({
      timeout: 15_000,
    });

    // At least 9 widgets should be on this page
    const widgetCount = await page
      .locator("[data-testid='widget-card']")
      .count();
    expect(widgetCount).toBeGreaterThanOrEqual(9);

    // A seed widget of an unregistered type still renders a card, so the
    // count alone cannot tell (#1687 left a treemap tile here).
    await expect(page.getByText("Unknown chart type")).toHaveCount(0);
  });

  test("should show Color Palettes page tab", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Color Palettes" })).toBeVisible(
      { timeout: 10_000 },
    );
  });
});
