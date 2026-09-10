import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  typeInEditor,
  getPreview,
  saveDashboard,
} from "./fixtures";

// ---------------------------------------------------------------------------
// #1684 — the bar chart's deprecated `stacked` boolean is gone. `stackMode`
// is the only stacking knob, end to end: Style-tab control → persisted
// chartOptions → rendered widget. Same for the palette: no alias layer, the
// select's own id is what gets stored.
// ---------------------------------------------------------------------------

test.describe("Bar chart stack mode (#1684)", () => {
  let dashboardId = "";
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Stack Mode ${Date.now()}`,
    );
    dashboardId = id;
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(
      page.getByRole("heading", { name: /^Editing:/ }),
    ).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("a stacked bar widget round-trips through stackMode only", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Bar Chart is default — select Neo4j connection
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();

    // Two numeric series per label, so stacking has something to stack.
    await typeInEditor(
      dialog,
      page,
      "MATCH (p:Person)-[r]->(m:Movie) RETURN m.title AS label, " +
        "sum(CASE WHEN type(r) = 'ACTED_IN' THEN 1 ELSE 0 END) AS acted, " +
        "sum(CASE WHEN type(r) = 'DIRECTED' THEN 1 ELSE 0 END) AS directed " +
        "ORDER BY acted DESC LIMIT 5",
    );
    await expect(
      dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)"),
    ).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();

    const preview = getPreview(dialog);
    await expect(preview.locator("canvas")).toBeVisible({ timeout: 15_000 });

    // Style tab. "Layout" is the first category and open by default;
    // "Appearance" is collapsed.
    await dialog.getByRole("tab", { name: "Style" }).click();
    await dialog.locator("#stackMode").click();
    await page.getByRole("option", { name: "Stacked", exact: true }).click();
    await dialog.getByRole("button", { name: "Appearance" }).click();
    await dialog.locator("#colorPalette").click();
    await page.getByRole("option", { name: "Tableau 10" }).click();

    // Chart re-renders with the new options, no error
    await expect(preview.locator("canvas")).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText("Query Failed")).not.toBeVisible();

    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    await saveDashboard(page);

    // What was persisted: stackMode and the palette's own id — and no
    // `stacked` boolean anywhere.
    const res = await page.request.get(`/api/dashboards/${dashboardId}`);
    const body = (await res.json()) as {
      data: {
        layoutJson: {
          pages: Array<{
            widgets: Array<{
              settings?: { chartOptions?: Record<string, unknown> };
            }>;
          }>;
        };
      };
    };
    const chartOptions =
      body.data.layoutJson.pages[0].widgets[0].settings?.chartOptions ?? {};
    expect(chartOptions).toMatchObject({
      stackMode: "stacked",
      colorPalette: "tableau",
    });
    expect(chartOptions).not.toHaveProperty("stacked");

    // And the saved widget renders on the view page.
    await page.goto(`/${dashboardId}`);
    const card = page.locator("[data-testid='widget-card']").first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.locator("canvas")).toBeVisible({ timeout: 15_000 });
  });
});
