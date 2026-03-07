import { test, expect, ALICE, createTestDashboard, typeInEditor, getPreview } from "./fixtures";

test.describe("Widget creation", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Widget Creation ${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    // Navigate to the new dashboard in edit mode
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("should complete widget creation flow", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select connection (Bar Chart is default)
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    await typeInEditor(dialog, page, "MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 5");

    await expect(dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)")).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
    // Wait for preview to render
    await expect(getPreview(dialog)).toBeVisible({
      timeout: 15000,
    });

    // Add widget
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("should add a table widget", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    // Select connection first to avoid CM readonly race (chart type change after
    // connection is set re-renders the editor but preserves the connectionId state)
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();

    await typeInEditor(dialog, page, "MATCH (m:Movie) RETURN m.title, m.released LIMIT 10");

    await expect(dialog.getByRole("button", { name: "Add Widget" })).toBeEnabled({ timeout: 10_000 });
    await dialog.getByRole("button", { name: "Add Widget" }).click();
  });

  test("should add a JSON viewer widget", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    // Select connection first to avoid CM readonly race
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "JSON Viewer" }).click();

    await typeInEditor(dialog, page, "MATCH (m:Movie) RETURN m LIMIT 3");

    await expect(dialog.getByRole("button", { name: "Add Widget" })).toBeEnabled({ timeout: 10_000 });
    await dialog.getByRole("button", { name: "Add Widget" }).click();
  });

  test("should render table with dot-notation fields (n.name)", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    // Select connection first to avoid CM readonly race
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();

    // Use a Cypher query that returns dotted field names.
    // No LIMIT here — wrapWithPreviewLimit appends LIMIT 25 automatically.
    // Including LIMIT in the query + wrapWithPreviewLimit = double LIMIT → Cypher error.
    await typeInEditor(dialog, page, "MATCH (n:Person) RETURN n.name, n.born ORDER BY n.name");

    await expect(dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)")).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();

    // Wait for the preview to render — should show table data (not empty)
    await expect(getPreview(dialog)).toBeVisible({
      timeout: 15_000,
    });
    // The table header should contain the dotted key as-is
    // Scope to <th> to avoid matching the CM editor content which also contains "n.name"
    await expect(dialog.locator("th").filter({ hasText: "n.name" })).toBeVisible({ timeout: 10_000 });
    // And the table should contain at least one data row
    await expect(dialog.locator("tbody tr").first()).toBeVisible({ timeout: 10_000 });
  });

  test("should add a PostgreSQL widget and preview data", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    // Select PG connection first to avoid CM readonly race
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /PostgreSQL/ }).click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();

    await typeInEditor(dialog, page, "SELECT title, released FROM movies LIMIT 5");

    await expect(dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)")).toBeEnabled({ timeout: 10_000 });
    await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();

    // Wait for preview
    await expect(getPreview(dialog)).toBeVisible({
      timeout: 15_000,
    });
    // Should contain a movie title from the seed data
    await expect(
      dialog.getByText("The Matrix", { exact: true }).or(dialog.getByText("Top Gun"))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("modal shows connection and chart type selectors", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // The new single-view modal should show both Connection and Chart Type selectors
    await expect(dialog.locator("label").filter({ hasText: "Connection" }).first()).toBeVisible();
    await expect(dialog.getByText("Chart Type", { exact: true })).toBeVisible();

    // Query editor should be immediately visible
    await expect(dialog.locator("[data-testid='codemirror-container']")).toBeVisible();
  });

  test("connector combobox filters results by typed text", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Open the connection combobox (first combobox in dialog)
    await dialog.getByRole("combobox").nth(0).click();
    // Type a partial name that exists (e.g. "neo" matches the Neo4j connection)
    await page.getByPlaceholder("Search connections...").fill("neo");
    // At least one matching option should be visible
    await expect(page.getByRole("option").first()).toBeVisible({ timeout: 5_000 });
    // Non-matching connections should not appear; pick the first visible option
    await page.getByRole("option").first().click();
    // Run button should be visible (no Next step anymore)
    await expect(dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)")).toBeVisible();
  });
});

test.describe("Widget edit – query cache invalidation", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Widget Edit ${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("re-fetches query data after editing widget with changed query", async ({ page }) => {
    // Set up response waiter BEFORE the action that triggers the request to
    // avoid a race condition where the response arrives before waitForResponse
    // starts listening.
    const firstQuery = "MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 3";
    const secondQuery = "MATCH (p:Person) RETURN p.name AS label, p.born AS value LIMIT 3";

    // Step 1: add a widget via the dialog
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    await typeInEditor(dialog, page, firstQuery);

    // Set up response waiter BEFORE closing the dialog — the widget will
    // fetch its query data as soon as it mounts on the dashboard grid.
    const initialFetch = page.waitForResponse(
      (res) => res.url().includes("/api/query") && res.status() === 200,
      { timeout: 30_000 }
    );

    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    // Confirm the card fetched its initial data
    await initialFetch;

    // Wait for the widget card to fully render before opening edit
    const actionsBtn = page.getByRole("button", { name: "Widget actions" }).last();
    await expect(actionsBtn).toBeVisible({ timeout: 15_000 });

    // Step 2: open edit modal and save with a different query
    const refetch = page.waitForResponse(
      (res) => res.url().includes("/api/query") && res.status() === 200,
      { timeout: 15_000 }
    );

    await actionsBtn.click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    const editDialog = page.getByRole("dialog", { name: "Edit Widget" });
    await expect(editDialog).toBeVisible({ timeout: 10_000 });

    // Use the Clear query button to reliably reset CodeMirror state
    // (Ctrl+A + insertText doesn't reliably update the React-controlled CM value)
    await editDialog.getByRole("button", { name: "Clear query" }).click();
    await typeInEditor(editDialog, page, secondQuery);

    await editDialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(editDialog).not.toBeVisible();

    // The query key changed (different query string), so the card must re-fetch
    await refetch;
  });
});

// ---------------------------------------------------------------------------
// Widget duplicate and fullscreen
// ---------------------------------------------------------------------------

test.describe("Widget duplicate", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Widget Dup ${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("should duplicate a widget via actions menu", async ({ page }) => {
    test.setTimeout(60_000);

    // Add a widget
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    await typeInEditor(dialog, page, "MATCH (m:Movie) RETURN m.title LIMIT 3");
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Should have 1 widget
    await expect(page.locator("[data-testid='widget-card']")).toHaveCount(1, { timeout: 10_000 });

    // Open widget actions and click Duplicate
    const actionsBtn = page.getByRole("button", { name: "Widget actions" }).last();
    await expect(actionsBtn).toBeVisible({ timeout: 10_000 });
    await actionsBtn.click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();

    // Should now have 2 widget cards
    await expect(page.locator("[data-testid='widget-card']")).toHaveCount(2, { timeout: 10_000 });
  });
});

test.describe("Widget fullscreen", () => {
  test("should open fullscreen dialog and render chart", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(60_000);
    await authPage.login(ALICE.email, ALICE.password);

    // Navigate to "Movie Analytics" view mode
    await page.getByText("Movie Analytics", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // Wait for widgets to load
    await expect(page.locator("[data-testid='widget-card']").first()).toBeVisible({
      timeout: 15_000,
    });

    // Click fullscreen button (sr-only text "Fullscreen")
    const fullscreenBtn = page.getByRole("button", { name: "Fullscreen" }).first();
    await expect(fullscreenBtn).toBeVisible({ timeout: 10_000 });
    await fullscreenBtn.click();

    // A dialog should open with the chart rendered
    await expect(page.locator("[role='dialog']")).toBeVisible({ timeout: 5_000 });
    // The fullscreen dialog should contain a chart (canvas or table)
    await expect(
      page.locator("[role='dialog'] canvas").or(page.locator("[role='dialog'] table")).first()
    ).toBeVisible({ timeout: 10_000 });

    // Close with Escape
    await page.keyboard.press("Escape");
    await expect(page.locator("[role='dialog']")).not.toBeVisible({ timeout: 5_000 });
  });
});
