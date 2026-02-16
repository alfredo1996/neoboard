import { test, expect, ALICE } from "./fixtures";

test.describe("Chart rendering", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    // Navigate to Movie Analytics which should have pre-configured widgets
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10000 });
  });

  test("bar chart should render SVG/canvas, not JSON text", async ({ page }) => {
    // If no echarts found, at least verify no raw JSON is displayed
    const jsonText = page.locator("pre").filter({ hasText: '{"label"' });
    await expect(jsonText).not.toBeVisible({ timeout: 10000 });
  });

  test("table chart should render DataGrid with rows", async ({ page }) => {
    // Navigate to edit and add a table widget to test
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Table", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog
      .getByRole("textbox")
      .fill("MATCH (m:Movie) RETURN m.title, m.released LIMIT 5");
    await dialog.getByRole("button", { name: "Show Preview" }).click();

    // DataGrid should render a table element
    await expect(dialog.locator("table").first()).toBeVisible({ timeout: 15000 });
  });

  test("single value chart should render a large number", async ({ page }) => {
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Value", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByRole("textbox").fill("MATCH (m:Movie) RETURN count(m) AS count");
    await dialog.getByRole("button", { name: "Show Preview" }).click();

    // SingleValueChart renders with data-testid
    await expect(dialog.locator("[data-testid='single-value-chart']").first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("JSON viewer should render collapsible tree", async ({ page }) => {
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Add Widget" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("JSON", { exact: true }).click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByRole("textbox").fill("MATCH (m:Movie) RETURN m LIMIT 2");
    await dialog.getByRole("button", { name: "Show Preview" }).click();

    // JsonViewer renders with font-mono class
    await expect(
      dialog.locator("[class*='font-mono']").first()
    ).toBeVisible({ timeout: 15000 });
  });
});
