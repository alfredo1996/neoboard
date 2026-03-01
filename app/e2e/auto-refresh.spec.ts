import { test, expect, ALICE } from "./fixtures";

test.describe("Auto-refresh", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("should enable auto-refresh and persist setting after reload", async ({ page }) => {
    // Navigate to the "Movie Analytics" dashboard (seeded)
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();

    // Open auto-refresh dropdown
    const refreshButton = page.getByRole("button", { name: /Auto-refresh/i });
    await expect(refreshButton).toBeVisible();
    await refreshButton.click();

    // Select "30 seconds"
    await page.getByRole("menuitemradio", { name: "30 seconds" }).click();

    // Verify the button now shows "30s"
    await expect(page.getByRole("button", { name: /30s/i })).toBeVisible();

    // Reload and verify the setting persisted
    await page.reload();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: /30s/i })).toBeVisible({ timeout: 10_000 });

    // Disable auto-refresh to clean up
    await page.getByRole("button", { name: /30s/i }).click();
    await page.getByRole("menuitemradio", { name: "Off" }).click();
    await expect(page.getByRole("button", { name: /Auto-refresh/i })).toBeVisible();
  });
});
