import { test, expect, ALICE } from "./fixtures";

test.describe("Widget creation", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    // Navigate to a dashboard in edit mode
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test("should complete two-step widget creation flow", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");

    // Step 1: Select chart type and connection
    await expect(dialog.getByText("Select Type")).toBeVisible();
    await dialog.getByText("Bar", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Next" }).click();

    // Step 2: Configure query and preview
    await expect(dialog.getByText("Configure")).toBeVisible();
    await dialog
      .getByLabel("Query")
      .fill("MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 5");

    await dialog.getByRole("button", { name: "Run Query" }).click();
    // Wait for preview to render
    await expect(dialog.locator(".border.rounded-lg").first()).toBeVisible({
      timeout: 15000,
    });

    // Add widget
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("should add a table widget", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Table", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Next" }).click();

    await dialog.getByLabel("Query").fill("MATCH (m:Movie) RETURN m.title, m.released LIMIT 10");
    await dialog.getByRole("button", { name: "Add Widget" }).click();
  });

  test("should add a JSON viewer widget", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("JSON", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Next" }).click();

    await dialog.getByLabel("Query").fill("MATCH (m:Movie) RETURN m LIMIT 3");
    await dialog.getByRole("button", { name: "Add Widget" }).click();
  });

  test("should render table with dot-notation fields (n.name)", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Table", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    // Select Neo4j connection
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Next" }).click();

    // Use a Cypher query that returns dotted field names
    await dialog.getByLabel("Query").fill("MATCH (n:Person) RETURN n.name, n.born LIMIT 5");
    await dialog.getByRole("button", { name: "Run Query" }).click();

    // Wait for the preview to render — should show table data (not empty)
    await expect(dialog.locator(".border.rounded-lg").first()).toBeVisible({
      timeout: 15_000,
    });
    // The table header should contain the dotted key as-is
    await expect(dialog.getByText("n.name")).toBeVisible({ timeout: 10_000 });
    // And the table should contain actual data values
    await expect(dialog.getByText("Keanu Reeves").or(dialog.getByText("Tom Cruise"))).toBeVisible({ timeout: 10_000 });
  });

  test("should add a PostgreSQL widget and preview data", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Table", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    // Select the PG connection (2nd option, "Movies DB (PostgreSQL)")
    await page.getByRole("option", { name: /PostgreSQL/ }).click();
    await dialog.getByRole("button", { name: "Next" }).click();

    await dialog.getByLabel("Query").fill("SELECT title, released FROM movies LIMIT 5");
    await dialog.getByRole("button", { name: "Run Query" }).click();

    // Wait for preview
    await expect(dialog.locator(".border.rounded-lg").first()).toBeVisible({
      timeout: 15_000,
    });
    // Should contain a movie title from the seed data
    await expect(
      dialog.getByText("The Matrix", { exact: true }).or(dialog.getByText("Top Gun"))
    ).toBeVisible({ timeout: 10_000 });
  });

  test("should navigate back from step 2 to step 1", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Next" }).click();

    await expect(dialog.getByText("Configure")).toBeVisible();
    await dialog.getByRole("button", { name: /Back/ }).click();
    await expect(dialog.getByText("Select Type")).toBeVisible();
  });

  test("connector combobox filters results by typed text", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");

    // Open the searchable combobox
    await dialog.getByRole("combobox").click();
    // Type a partial name that exists (e.g. "neo" matches the Neo4j connection)
    await page.getByPlaceholder("Search connections...").fill("neo");
    // At least one matching option should be visible
    await expect(page.getByRole("option").first()).toBeVisible({ timeout: 5_000 });
    // Non-matching connections should not appear; pick the first visible option
    await page.getByRole("option").first().click();
    // Next button should now be enabled
    await expect(dialog.getByRole("button", { name: "Next" })).toBeEnabled();
  });
});

test.describe("Widget edit – query cache invalidation", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test("re-fetches query data after editing widget with changed query", async ({ page }) => {
    // Track POST /api/query calls so we can assert a re-fetch happens after save
    const queryRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/query") && req.method() === "POST") {
        queryRequests.push(req.url());
      }
    });

    // Add a widget
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Next" }).click();
    const firstQuery = "MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 3";
    await dialog.getByLabel("Query").fill(firstQuery);
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();

    // Wait for the card to finish fetching the initial query
    await page.waitForResponse(
      (res) => res.url().includes("/api/query") && res.status() === 200,
      { timeout: 15_000 }
    );
    const requestsAfterAdd = queryRequests.length;

    // Open the widget's action menu and click "Edit"
    await page
      .getByRole("button", { name: "Widget actions" })
      .last()
      .click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();

    // Change the query to something different so the cache key would differ
    const secondQuery = "MATCH (p:Person) RETURN p.name AS label, p.born AS value LIMIT 3";
    await editDialog.getByLabel("Query").fill(secondQuery);
    await editDialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(editDialog).not.toBeVisible();

    // Cache was invalidated on save → the card must re-fetch regardless of staleTime
    await page.waitForResponse(
      (res) => res.url().includes("/api/query") && res.status() === 200,
      { timeout: 15_000 }
    );
    expect(queryRequests.length).toBeGreaterThan(requestsAfterAdd);
  });
});
