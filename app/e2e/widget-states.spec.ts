import { test, expect, ALICE } from "./fixtures";

test.describe("Widget editor", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    // Create a fresh dashboard to avoid test pollution from other specs
    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#dashboard-name").fill("Widget States Test");
    await dialog.getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/\/edit/, { timeout: 10_000 });
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.describe("uncovered states", () => {
    test("should show preview error for invalid query", async ({ page }) => {
      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog");

      // Step 1: Select bar chart + connection
      await dialog.getByText("Bar", { exact: true }).click();
      await dialog.getByRole("combobox").click();
      await page.getByRole("option").first().click();
      await dialog.getByRole("button", { name: "Next" }).click();

      // Step 2: Enter an invalid query
      await dialog.getByLabel("Query").fill("THIS IS NOT VALID CYPHER !!!");
      await dialog.getByRole("button", { name: "Run Query" }).click();

      // Should show error
      await expect(
        dialog.getByText(/failed|error|invalid|syntax/i).first()
      ).toBeVisible({ timeout: 15_000 });
    });

    test("step 1 should show all chart types", async ({ page }) => {
      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Select Type")).toBeVisible();

      // All standard chart types should be visible
      await expect(dialog.getByText("Bar", { exact: true })).toBeVisible();
      await expect(dialog.getByText("Line", { exact: true })).toBeVisible();
      await expect(dialog.getByText("Pie", { exact: true })).toBeVisible();
      await expect(dialog.getByText("Table", { exact: true })).toBeVisible();
      await expect(dialog.getByText("Graph", { exact: true })).toBeVisible();
      await expect(dialog.getByText("Map", { exact: true })).toBeVisible();
      await expect(dialog.getByText("Value", { exact: true })).toBeVisible();
      await expect(dialog.getByText("JSON", { exact: true })).toBeVisible();
    });
  });

  test.describe("actions menu", () => {
    test("widget card should show actions menu with edit and remove", async ({
      page,
    }) => {
      // Add a widget first
      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog");
      await dialog.getByText("Table", { exact: true }).click();
      await dialog.getByRole("combobox").click();
      await page.getByRole("option").first().click();
      await dialog.getByRole("button", { name: "Next" }).click();
      await dialog
        .getByLabel("Query")
        .fill("MATCH (m:Movie) RETURN m.title LIMIT 3");
      await dialog.getByRole("button", { name: "Add Widget" }).click();
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });

      // Open widget actions menu
      const actionsBtn = page
        .getByRole("button", { name: "Widget actions" })
        .last();
      await expect(actionsBtn).toBeVisible({ timeout: 10_000 });
      await actionsBtn.click();

      // Should show Edit and Remove menu items
      await expect(
        page.getByRole("menuitem", { name: "Edit" })
      ).toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: "Remove" })
      ).toBeVisible();
    });
  });
});
