import { test, expect, ALICE } from "./fixtures";

test.describe("Widget editor", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    // Create a fresh dashboard to avoid test pollution from other specs
    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const dialog = page.getByRole("dialog", { name: "Create Dashboard" });
    await dialog.locator("#dashboard-name").fill("Widget States Test");
    await dialog.getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/\/edit/, { timeout: 10_000 });
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.describe("uncovered states", () => {
    test("should show preview error for invalid query", async ({ page }) => {
      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });

      // Select connection (Bar Chart is default)
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      // Enter an invalid query into the CodeMirror editor
      const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
      await cm.click();
      await page.keyboard.insertText("THIS IS NOT VALID CYPHER !!!");

      // Run the query
      await dialog.getByRole("button", { name: "Run" }).click();

      // Should show error
      await expect(
        dialog.getByText(/failed|error|invalid|syntax/i).first()
      ).toBeVisible({ timeout: 15_000 });
    });

    test("chart type selector shows all chart types", async ({ page }) => {
      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });

      // The modal should show Connection and Chart Type selectors
      await expect(dialog.locator("label").filter({ hasText: "Connection" }).first()).toBeVisible();
      await expect(dialog.getByText("Chart Type", { exact: true })).toBeVisible();

      // Query editor should be immediately visible
      await expect(dialog.locator("[data-testid='codemirror-container']")).toBeVisible();

      // Open the chart type dropdown (2nd combobox)
      await dialog.getByRole("combobox").nth(1).click();

      // All standard chart types should be in the dropdown options
      await expect(page.getByRole("option", { name: "Bar Chart" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Line Chart" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Pie Chart" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Data Table" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Graph" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Map" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Single Value" })).toBeVisible();
      await expect(page.getByRole("option", { name: "JSON Viewer" })).toBeVisible();

      // Close by pressing Escape
      await page.keyboard.press("Escape");
    });
  });

  test.describe("actions menu", () => {
    test("widget card should show actions menu with edit and remove", async ({
      page,
    }) => {
      // Add a widget first
      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "Data Table" }).click();
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
      await cm.click();
      await page.keyboard.insertText("MATCH (m:Movie) RETURN m.title LIMIT 3");

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
