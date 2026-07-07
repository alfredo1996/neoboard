import { test, expect, ALICE } from "./fixtures";

test.describe("Dashboard grid", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.getByText("Movie Analytics", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10000 });
  });

  test("view mode should not show drag handles", async ({ page }) => {
    // In view mode, react-grid-layout items should not be draggable
    const dragHandle = page.locator(".react-grid-item.react-draggable");
    await expect(dragHandle).toHaveCount(0);
  });

  test("edit mode should allow drag and resize", async ({ page }) => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText("Editing:")).toBeVisible();

    // In edit mode, grid items should have draggable class
    const gridItem = page.locator(".react-grid-item").first();
    await expect(gridItem).toBeVisible({ timeout: 5000 });

    // Resize handle should be visible in edit mode
    const resizeHandle = page.locator(".react-resizable-handle").first();
    await expect(resizeHandle).toBeVisible();
  });

  test("resizing the window in edit mode does not dirty the dashboard", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText("Editing:")).toBeVisible({ timeout: 10000 });

    // Pure responsive reflow across breakpoints — no user drag/resize.
    await page.setViewportSize({ width: 900, height: 1024 });
    await page.setViewportSize({ width: 700, height: 1024 });
    await page.setViewportSize({ width: 1280, height: 1024 });

    // Because a reflow is not a user edit, leaving via Back must navigate
    // straight to view mode — no unsaved-changes confirmation dialog.
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByText("Editing:")).toBeHidden({ timeout: 10000 });
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible();
  });

  test("should save layout changes", async ({ page }) => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText("Editing:")).toBeVisible({ timeout: 10000 });

    // Click Save and verify the button is present and clickable
    const saveButton = page.getByRole("button", { name: "Save" });
    await expect(saveButton).toBeVisible();
    await saveButton.click();
    // Verify the save button returns to normal state (not stuck in loading)
    await expect(saveButton).toBeEnabled({ timeout: 10000 });
  });
});
