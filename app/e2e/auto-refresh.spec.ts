import { test, expect, ALICE } from "./fixtures";

// Serial: both tests mutate the same seeded "Movie Analytics" dashboard.
// Running in parallel causes one test to see the other's interval setting.
test.describe.serial("Auto-refresh", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("should enable auto-refresh and persist setting after reload", async ({ page }) => {
    // Navigate to the "Movie Analytics" dashboard (seeded)
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();

    // Open auto-refresh dropdown — wait for it to be fully interactive
    const refreshButton = page.getByTestId("auto-refresh-trigger");
    await expect(refreshButton).toBeVisible({ timeout: 10_000 });
    await refreshButton.click();

    // Wait for the PUT request to complete before reloading — avoids
    // the race where reload fires before the mutation commits to the DB.
    const putResponse = page.waitForResponse(
      (resp) => resp.url().includes("/api/dashboards/") && resp.request().method() === "PUT",
    );
    await page.getByRole("menuitemradio", { name: "30 seconds" }).click();
    await putResponse;

    // Verify the button now shows "30s" (followed by countdown)
    await expect(page.getByTestId("auto-refresh-trigger")).toContainText("30s", { timeout: 5_000 });

    // Reload and verify the setting persisted from the DB
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("auto-refresh-trigger")).toContainText("30s", { timeout: 10_000 });

    // Disable auto-refresh to clean up
    await page.getByTestId("auto-refresh-trigger").click();
    await page.getByRole("menuitemradio", { name: "Off" }).click();
    await expect(page.getByTestId("auto-refresh-trigger")).toContainText("Auto-refresh");
  });

  test("should accept a custom interval and trigger a refresh", async ({ page }) => {
    // Navigate to the "Movie Analytics" dashboard (seeded)
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();

    // Open auto-refresh dropdown and set a 5-second custom interval.
    // The dropdown closes automatically after clicking "Set" (controlled state).
    await page.getByTestId("auto-refresh-trigger").click();
    await page.getByTestId("custom-interval-input").fill("5");
    await page.getByTestId("custom-interval-apply").click();

    // Button should show "5s" + countdown; dropdown should be closed
    await expect(page.getByTestId("auto-refresh-trigger")).toContainText("5s", { timeout: 5_000 });

    // Wait for the auto-refresh to trigger at least one query cycle
    await page.waitForResponse(
      (resp) => resp.url().includes("/api/query") && resp.request().method() === "POST",
      { timeout: 10_000 },
    );
    await expect(page.getByTestId("auto-refresh-trigger")).toContainText("5s");
    // No widget should be stuck on a loading skeleton after the refresh
    await expect(page.locator("[data-loading='true']")).toHaveCount(0, { timeout: 3_000 });

    // Clean up — disable (dropdown is closed, so trigger click opens it cleanly)
    await page.getByTestId("auto-refresh-trigger").click();
    await page.getByRole("menuitemradio", { name: "Off" }).click();
    await expect(page.getByTestId("auto-refresh-trigger")).toContainText("Auto-refresh");
  });
});
