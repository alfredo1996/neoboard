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
});
