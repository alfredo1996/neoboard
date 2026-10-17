import { test, expect, ALICE } from "./fixtures";
import { openThemeMenu } from "./pages/sidebar";

test.describe("Theme toggle", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("switch to dark mode adds .dark class to html", async ({ page }) => {
    await openThemeMenu(page);
    await page.getByRole("menuitemradio", { name: "Dark" }).click();

    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("switch to light mode removes .dark class", async ({ page }) => {
    // Set dark first, then switch to light
    await openThemeMenu(page);
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await openThemeMenu(page);
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("system theme follows prefers-color-scheme", async ({ page }) => {
    // Emulate dark color scheme
    await page.emulateMedia({ colorScheme: "dark" });

    await openThemeMenu(page);
    await page.getByRole("menuitemradio", { name: "System" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Switch to light scheme
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).not.toHaveClass(/dark/, {
      timeout: 5_000,
    });
  });

  test("theme preference persists after reload", async ({ page }) => {
    await openThemeMenu(page);
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
    await openThemeMenu(page);
    await page.getByRole("menuitemradio", { name: "System" }).click();
  });

  test("dialog scrim is dark in dark mode (#2211)", async ({ page }) => {
    await openThemeMenu(page);
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.goto("/connections");
    await page.getByRole("button", { name: "Add Connection" }).click();
    const overlay = page.locator("[data-state='open'].fixed.inset-0.z-50");
    await expect(overlay).toBeVisible();
    // Poll: the overlay may still be mounting. Alpha is checked too: a
    // transparent overlay computes to rgba(0, 0, 0, 0), whose channels are dark.
    await expect
      .poll(async () => {
        const bg = await overlay.evaluate(
          (el) => getComputedStyle(el).backgroundColor,
        );
        const [r, g, b, a = 1] = (bg.match(/[\d.]+/g) ?? []).map(Number);
        return [r, g, b].every((n) => n < 60) && a >= 0.3;
      })
      .toBe(true);

    await page.keyboard.press("Escape");
    await openThemeMenu(page);
    await page.getByRole("menuitemradio", { name: "System" }).click();
  });

  test("theme applies on dashboard view page", async ({ page }) => {
    // Navigate to a dashboard
    await page.getByText("Movie Analytics", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    await openThemeMenu(page);
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
    await openThemeMenu(page);
    await page.getByRole("menuitemradio", { name: "System" }).click();
  });
});
