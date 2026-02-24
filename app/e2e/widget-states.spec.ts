import { test, expect, ALICE } from "./fixtures";

test.describe("Widget editor — uncovered states", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test("widget editor should show preview error for invalid query", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");

    // Step 1: Select bar chart + connection
    await dialog.getByText("Bar", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Next" }).click();

    // Step 2: Enter an invalid query
    await dialog.getByLabel("Query").fill("THIS IS NOT VALID CYPHER !!!");
    await dialog.getByRole("button", { name: "Run Query" }).click();

    // Should show error (alert or error text)
    await expect(
      dialog
        .getByText(/failed|error|invalid|syntax/i)
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("widget editor should show map chart type option", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Select Type")).toBeVisible();
    // Map type should be available
    await expect(dialog.getByText("Map", { exact: true })).toBeVisible();
  });

  test("widget editor should show single value chart type option", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Select Type")).toBeVisible();
    await expect(dialog.getByText("Value", { exact: true }).or(dialog.getByText("Single", { exact: false }))).toBeVisible();
  });

  test("widget editor step 1 should show all chart types", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Select Type")).toBeVisible();

    // All standard chart types should be visible
    await expect(dialog.getByText("Bar", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Line", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Pie", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Table", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Graph", { exact: true })).toBeVisible();
  });
});

test.describe("Widget edit actions menu", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test("widget card should show actions menu with edit and delete", async ({
    page,
  }) => {
    // Add a widget first
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Table", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog
      .getByLabel("Query")
      .fill("MATCH (m:Movie) RETURN m.title LIMIT 3");
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();

    // Open widget actions menu
    const actionsBtn = page
      .getByRole("button", { name: "Widget actions" })
      .last();
    await expect(actionsBtn).toBeVisible({ timeout: 10_000 });
    await actionsBtn.click();

    // Should show Edit and Delete menu items
    await expect(
      page.getByRole("menuitem", { name: "Edit" })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Delete" })
    ).toBeVisible();
  });
});
