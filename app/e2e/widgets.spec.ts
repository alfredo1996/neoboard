import { test, expect, ALICE, createTestDashboard } from "./fixtures";

test.describe("Widget creation", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("should complete widget creation flow", async ({ page }) => {
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Widget Flow ${Date.now()}`,
    );
    try {
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });

      // Select connection (Bar Chart is default)
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
      await cm.click();
      await page.keyboard.insertText("MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 5");

      await dialog.getByRole("button", { name: "Run" }).click();
      // Wait for preview to render
      await expect(dialog.locator(".border.rounded-lg").first()).toBeVisible({
        timeout: 15000,
      });

      // Add widget
      await dialog.getByRole("button", { name: "Add Widget" }).click();
      await expect(dialog).not.toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test("should add a table widget", async ({ page }) => {
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Table Widget ${Date.now()}`,
    );
    try {
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "Data Table" }).click();
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
      await cm.click();
      await page.keyboard.insertText("MATCH (m:Movie) RETURN m.title, m.released LIMIT 10");

      await dialog.getByRole("button", { name: "Add Widget" }).click();
    } finally {
      await cleanup();
    }
  });

  test("should add a JSON viewer widget", async ({ page }) => {
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `JSON Widget ${Date.now()}`,
    );
    try {
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "JSON Viewer" }).click();
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
      await cm.click();
      await page.keyboard.insertText("MATCH (m:Movie) RETURN m LIMIT 3");

      await dialog.getByRole("button", { name: "Add Widget" }).click();
    } finally {
      await cleanup();
    }
  });

  test("should render table with dot-notation fields (n.name)", async ({ page }) => {
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Dot Notation ${Date.now()}`,
    );
    try {
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "Data Table" }).click();
      // Select Neo4j connection
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      // Use a Cypher query that returns dotted field names.
      // No LIMIT here — wrapWithPreviewLimit appends LIMIT 25 automatically.
      // Including LIMIT in the query + wrapWithPreviewLimit = double LIMIT → Cypher error.
      const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
      await cm.click();
      await page.keyboard.insertText("MATCH (n:Person) RETURN n.name, n.born ORDER BY n.name");

      await dialog.getByRole("button", { name: "Run" }).click();

      // Wait for the preview to render — should show table data (not empty)
      await expect(dialog.locator(".border.rounded-lg").first()).toBeVisible({
        timeout: 15_000,
      });
      // The table header should contain the dotted key as-is
      // Scope to <th> to avoid matching the CM editor content which also contains "n.name"
      await expect(dialog.locator("th").filter({ hasText: "n.name" })).toBeVisible({ timeout: 10_000 });
      // And the table should contain at least one data row
      await expect(dialog.locator("tbody tr").first()).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanup();
    }
  });

  test("should add a PostgreSQL widget and preview data", async ({ page }) => {
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `PG Widget ${Date.now()}`,
    );
    try {
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "Data Table" }).click();
      // Select the PG connection
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option", { name: /PostgreSQL/ }).click();

      const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
      await cm.click();
      await page.keyboard.insertText("SELECT title, released FROM movies LIMIT 5");

      await dialog.getByRole("button", { name: "Run" }).click();

      // Wait for preview
      await expect(dialog.locator(".border.rounded-lg").first()).toBeVisible({
        timeout: 15_000,
      });
      // Should contain a movie title from the seed data
      await expect(
        dialog.getByText("The Matrix", { exact: true }).or(dialog.getByText("Top Gun"))
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await cleanup();
    }
  });

  test("modal shows connection and chart type selectors", async ({ page }) => {
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Modal Selectors ${Date.now()}`,
    );
    try {
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });

      // The new single-view modal should show both Connection and Chart Type selectors
      await expect(dialog.locator("label").filter({ hasText: "Connection" }).first()).toBeVisible();
      await expect(dialog.getByText("Chart Type", { exact: true })).toBeVisible();

      // Query editor should be immediately visible
      await expect(dialog.locator("[data-testid='codemirror-container']")).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test("connector combobox filters results by typed text", async ({ page }) => {
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Combobox Filter ${Date.now()}`,
    );
    try {
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible({ timeout: 15_000 });

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
      await expect(dialog.getByRole("button", { name: "Run" })).toBeVisible();
    } finally {
      await cleanup();
    }
  });
});

test.describe("Widget edit – query cache invalidation", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("re-fetches query data after editing widget with changed query", async ({ page }) => {
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Cache Invalidation ${Date.now()}`,
    );
    try {
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible({ timeout: 15_000 });

      // Set up response waiter BEFORE the action that triggers the request to
      // avoid a race condition where the response arrives before waitForResponse
      // starts listening.
      const firstQuery = "MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 3";
      const secondQuery = "MATCH (p:Person) RETURN p.name AS label, p.born AS value LIMIT 3";

      // Step 1: add a widget and wait for its initial fetch
      const initialFetch = page.waitForResponse(
        (res) => res.url().includes("/api/query") && res.status() === 200,
        { timeout: 15_000 }
      );

      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
      await cm.click();
      await page.keyboard.insertText(firstQuery);

      await dialog.getByRole("button", { name: "Add Widget" }).click();
      await expect(dialog).not.toBeVisible();

      // Confirm the card fetched its initial data
      await initialFetch;

      // Step 2: open edit modal and save with a different query
      const refetch = page.waitForResponse(
        (res) => res.url().includes("/api/query") && res.status() === 200,
        { timeout: 15_000 }
      );

      await page.getByRole("button", { name: "Widget actions" }).last().click();
      await page.getByRole("menuitem", { name: "Edit" }).click();

      const editDialog = page.getByRole("dialog", { name: "Edit Widget" });
      await expect(editDialog).toBeVisible();

      // Use the Clear query button to reliably reset CodeMirror state
      // (Ctrl+A + insertText doesn't reliably update the React-controlled CM value)
      await editDialog.getByRole("button", { name: "Clear query" }).click();
      const editCm = editDialog.locator("[data-testid='codemirror-container'] .cm-content");
      await editCm.click();
      await page.keyboard.insertText(secondQuery);

      await editDialog.getByRole("button", { name: "Save Changes" }).click();
      await expect(editDialog).not.toBeVisible();

      // The query key changed (different query string), so the card must re-fetch
      await refetch;
    } finally {
      await cleanup();
    }
  });
});
