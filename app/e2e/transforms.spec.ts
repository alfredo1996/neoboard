import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  typeInEditor,
  getPreview,
} from "./fixtures";

// ---------------------------------------------------------------------------
// Helper: open Add Widget dialog, select connection, type query, run it,
// and wait for preview. Shared across all transform tests.
// ---------------------------------------------------------------------------
async function setupWidgetWithQuery(
  page: import("@playwright/test").Page,
  opts: { chartType?: string; query?: string } = {},
) {
  await page.getByRole("button", { name: "Add Widget" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add Widget" });

  // Chart type before connection — selecting a connection kicks off a schema
  // fetch that re-renders the dialog, and clicking the second combobox during
  // it times out. Same order as heavy-widgets.spec.ts.
  if (opts.chartType) {
    await dialog.getByRole("combobox").nth(1).click();
    await page
      .getByRole("option", { name: opts.chartType, exact: true })
      .click();
  }

  // Select Neo4j connection
  await dialog.getByRole("combobox").nth(0).click();
  await page.getByRole("option").first().click();

  // Wait for editor to stabilize after connection selection triggers schema fetch
  await page.waitForTimeout(1_000);

  await typeInEditor(
    dialog,
    page,
    opts.query ??
      "MATCH (m:Movie) RETURN m.released AS year, count(*) AS count ORDER BY year",
  );
  // Wait for Run button and click it
  const runBtn = dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)");
  await expect(runBtn).toBeEnabled({ timeout: 15_000 });
  await runBtn.click();

  // Wait for preview to render — the widget-preview testid appears only after data arrives
  await expect(dialog.getByTestId("widget-preview")).toBeVisible({
    timeout: 20_000,
  });

  return dialog;
}

/**
 * Pick a Radix Select value by typeahead on the closed trigger. Clicking an
 * option in the open list flaked on CI two ways: the list's scroll button
 * covered the option, and a preview re-render detached it mid-click. A key
 * press never opens the list, so neither can happen. `key` must be unique
 * among the options' first characters.
 */
async function pickByKey(
  page: import("@playwright/test").Page,
  trigger: import("@playwright/test").Locator,
  key: string,
  expected: string,
) {
  await trigger.focus();
  await page.keyboard.press(key);
  await expect(trigger).toHaveText(expected);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Data Transforms", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `transforms-${Date.now()}`,
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

  test("Transform tab shows empty state and Add button", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await setupWidgetWithQuery(page);

    // Switch to Transform tab
    await dialog.getByRole("tab", { name: "Transform" }).click();

    // Should show empty state text + Add button
    await expect(dialog.getByText(/no transforms configured/i)).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Add", exact: true }),
    ).toBeVisible();
  });

  test("a configured filter actually filters the preview", async ({ page }) => {
    // Everything else in this file asserts editor chrome — a card badge, a
    // Remove button, a checkbox's own state. Nothing checked that a transform
    // TRANSFORMS anything, and the case named "controls preview" never read
    // the preview: `getPreview` was imported and never called (#1635).
    test.setTimeout(120_000);
    const dialog = await setupWidgetWithQuery(page, {
      chartType: "Data Table",
      query:
        "UNWIND [1999, 2001, 2003, 2005] AS year RETURN year, year - 1990 AS age ORDER BY year",
    });

    const preview = getPreview(dialog);
    const rows = preview.locator("tbody tr");
    await expect(rows).toHaveCount(4);

    await dialog.getByRole("tab", { name: "Transform" }).click();
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText("1. Filter")).toBeVisible();

    // Configure it: year > 2000. The default is `== ""`, which is why simply
    // adding a card — all this file did before — proves nothing.
    const panel = dialog.getByRole("tabpanel");
    await pickByKey(page, panel.getByRole("combobox").first(), "y", "year");
    await pickByKey(page, panel.getByRole("combobox").nth(1), ">", ">");
    await panel.getByPlaceholder("value or param").fill("2000");

    // Three of the four rows survive, and every one of them is post-2000.
    await expect(rows).toHaveCount(3, { timeout: 15_000 });
    const years = await rows
      .locator("td")
      .first()
      .evaluateAll((tds) => tds.map((td) => Number(td.textContent)));
    for (const year of years) expect(year).toBeGreaterThan(2000);
  });

  test("a calculated column renders exact money, not float noise (#1415)", async ({
    page,
  }) => {
    // 463.45 − 283.66 is 179.78999999999996 in IEEE-754, and the table used to
    // print exactly that.
    test.setTimeout(120_000);
    const dialog = await setupWidgetWithQuery(page, {
      chartType: "Data Table",
      query:
        "UNWIND [[463.45, 283.66], [462.52, 296.68], [507.68, 290.14]] AS r RETURN r[0] AS price, r[1] AS cost",
    });

    const preview = getPreview(dialog);
    await expect(preview.locator("tbody tr")).toHaveCount(3);

    await dialog.getByRole("tab", { name: "Transform" }).click();
    const panel = dialog.getByRole("tabpanel");
    // With no cards yet, the only combobox is the type picker next to Add.
    await panel.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /^Calculated Column/ }).click();
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText("1. Calculated Column")).toBeVisible();
    await panel
      .getByPlaceholder("e.g. salary * 0.1 or col + $param_rate")
      .fill("price - cost");

    // The derived column is appended after price and cost.
    await expect(preview.locator("tbody tr td:nth-child(3)")).toHaveText(
      ["179.79", "165.84", "217.54"],
      { timeout: 15_000 },
    );
  });

  test("a groupBy sum and average of money carry no float tail (#1415)", async ({
    page,
  }) => {
    // Unrounded, group a reads 0.30000000000000004 and 0.15000000000000002.
    test.setTimeout(120_000);
    const dialog = await setupWidgetWithQuery(page, {
      chartType: "Data Table",
      query:
        "UNWIND [['a', 0.1], ['a', 0.2], ['b', 463.45], ['b', 283.66], ['b', 0.01]] AS r RETURN r[0] AS status, r[1] AS total",
    });

    const preview = getPreview(dialog);
    await expect(preview.locator("tbody tr")).toHaveCount(5);

    await dialog.getByRole("tab", { name: "Transform" }).click();
    const panel = dialog.getByRole("tabpanel");
    const combos = panel.getByRole("combobox");
    const pick = (nth: number, key: string, expected: string) =>
      pickByKey(page, combos.nth(nth), key, expected);
    await pick(0, "g", "Group By");
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText("1. Group By")).toBeVisible();

    // Cards render above the type picker: 0 group column, then column + fn
    // per aggregation. The default groups by status with status_count.
    await pick(1, "t", "total");
    await pick(2, "s", "Sum");
    await panel.getByRole("button", { name: "Add aggregation" }).click();
    await pick(3, "t", "total");
    await pick(4, "a", "Average");

    const cells = (n: number) => preview.locator(`tbody tr td:nth-child(${n})`);
    await expect(cells(2)).toHaveText(["0.3", "747.12"], { timeout: 15_000 });
    await expect(cells(3)).toHaveText(["0.15", "249.04"]);
  });

  test("Add a filter transform — card appears with fields", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const dialog = await setupWidgetWithQuery(page);

    await dialog.getByRole("tab", { name: "Transform" }).click();
    await dialog.getByRole("button", { name: "Add", exact: true }).click();

    // Filter card should appear with "1. Filter" badge
    await expect(dialog.getByText("1. Filter")).toBeVisible();

    // Remove button should be visible
    await expect(
      dialog.getByRole("button", { name: "Remove transform" }),
    ).toBeVisible();
  });

  test("Add two transforms and remove first — renumbers correctly", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const dialog = await setupWidgetWithQuery(page);

    await dialog.getByRole("tab", { name: "Transform" }).click();

    // Add two transforms
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText("1. Filter")).toBeVisible();
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText("2. Filter")).toBeVisible();

    // Remove the first one
    const removeButtons = dialog.getByRole("button", {
      name: "Remove transform",
    });
    await removeButtons.first().click();

    // Should renumber: only "1. Filter" remains
    await expect(dialog.getByText("1. Filter")).toBeVisible();
    await expect(dialog.getByText("2. Filter")).not.toBeVisible();
  });

  test("Save widget with transforms — transforms persist on reopen", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const dialog = await setupWidgetWithQuery(page);

    // Add a filter transform
    await dialog.getByRole("tab", { name: "Transform" }).click();
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText("1. Filter")).toBeVisible();

    // Save the widget
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Save the dashboard
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForTimeout(1_000);

    // Reopen the widget editor
    const widgetCard = page.locator("[data-testid='widget-card']").first();
    await widgetCard.hover();
    await widgetCard.getByRole("button", { name: "Widget actions" }).click();
    await page.getByRole("menuitem", { name: /edit/i }).click();

    // Verify edit dialog opens
    const editDialog = page.getByRole("dialog", { name: "Edit Widget" });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });

    // Switch to Transform tab — saved transform should be there
    await editDialog.getByRole("tab", { name: "Transform" }).click();
    await expect(editDialog.getByText("1. Filter")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("Enable transforms toggle controls preview", async ({ page }) => {
    test.setTimeout(90_000);
    const dialog = await setupWidgetWithQuery(page);

    await dialog.getByRole("tab", { name: "Transform" }).click();

    // Add a limit transform (reduces data)
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText("1. Filter")).toBeVisible();

    // Toggle should be checked by default
    const toggle = dialog.locator("#transforms-enabled");
    await expect(toggle).toBeChecked();

    // Uncheck — transforms should be disabled
    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();

    // Re-check — transforms re-enabled
    await toggle.check();
    await expect(toggle).toBeChecked();
  });
});
