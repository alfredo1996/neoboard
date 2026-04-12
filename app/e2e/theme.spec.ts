import { test, expect, ALICE } from "./fixtures";

test.describe("Theme toggle", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("switch to dark mode adds .dark class to html", async ({ page }) => {
    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();

    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("switch to light mode removes .dark class", async ({ page }) => {
    // Set dark first, then switch to light
    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("system theme follows prefers-color-scheme", async ({ page }) => {
    // Emulate dark color scheme
    await page.emulateMedia({ colorScheme: "dark" });

    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "System" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Switch to light scheme
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).not.toHaveClass(/dark/, {
      timeout: 5_000,
    });
  });

  test("theme preference persists after reload", async ({ page }) => {
    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.reload({ waitUntil: "networkidle" });

    // Dark class should still be applied (persisted via localStorage)
    await expect(page.locator("html")).toHaveClass(/dark/);
    // Sidebar should be visible (proves the page loaded correctly)
    await expect(page.getByRole("button", { name: "Dashboards" })).toBeVisible({
      timeout: 10_000,
    });

    // Clean up — restore to system default
    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "System" }).click();
  });

  test("theme applies on dashboard view page", async ({ page }) => {
    // Navigate to a dashboard
    await page.getByText("Movie Analytics", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Verify background color changed (dark theme uses a dark background)
    const bgColor = await page
      .locator("body")
      .evaluate((el) =>
        getComputedStyle(el).getPropertyValue("background-color"),
      );
    // Dark mode background should have low RGB values
    const match = bgColor.match(/\d+/g);
    expect(match).toBeTruthy();
    const [r, g, b] = match!.map(Number);
    expect(r + g + b).toBeLessThan(200);

    // Clean up
    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "System" }).click();
  });
});
