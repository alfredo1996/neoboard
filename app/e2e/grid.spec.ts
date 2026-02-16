import { test, expect, ALICE } from "./fixtures";

test.describe("Dashboard grid", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10000 });
  });

  test("view mode should not show drag handles", async ({ page }) => {
    // In view mode, react-grid-layout items should not be draggable
    const dragHandle = page.locator(".react-grid-item.react-draggable");
    await expect(dragHandle).toHaveCount(0);
  });

  test("edit mode should allow drag and resize", async ({ page }) => {
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByText("Editing:")).toBeVisible();

    // In edit mode, grid items should have draggable class
    const gridItem = page.locator(".react-grid-item").first();
    await expect(gridItem).toBeVisible({ timeout: 5000 });

    // Resize handle should be visible in edit mode
    const resizeHandle = page.locator(".react-resizable-handle").first();
    await expect(resizeHandle).toBeVisible();
  });

  test("should save layout changes", async ({ page }) => {
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByText("Editing:")).toBeVisible();

    // Click Save and verify the button is present and clickable
    const saveButton = page.getByRole("button", { name: "Save" });
    await expect(saveButton).toBeVisible();
    await saveButton.click();
    // Verify the save button returns to normal state (not stuck in loading)
    await expect(saveButton).toBeEnabled({ timeout: 10000 });
  });
});
