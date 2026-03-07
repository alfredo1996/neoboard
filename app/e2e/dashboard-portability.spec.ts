import { test, expect, ALICE } from "./fixtures";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Dashboard export
// ---------------------------------------------------------------------------

test.describe("Dashboard export", () => {
  test("should export a dashboard as JSON", async ({ authPage, page }) => {
    test.setTimeout(30_000);
    await authPage.login(ALICE.email, ALICE.password);

    // Find the "Movie Analytics" card and open its dropdown
    const dashCard = page
      .locator("div[class*='cursor-pointer']")
      .filter({ hasText: "Movie Analytics" })
      .first();
    await expect(dashCard).toBeVisible({ timeout: 10_000 });
    await dashCard.getByRole("button", { name: "Dashboard options" }).click();

    // Set up the download listener BEFORE clicking Export
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Export" }).click();
    const download = await downloadPromise;

    // Verify the filename ends with .json
    expect(download.suggestedFilename()).toMatch(/\.json$/);

    // Read and parse the downloaded JSON
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const content = fs.readFileSync(downloadPath!, "utf-8");
    const json = JSON.parse(content);

    // Verify structure
    expect(json).toHaveProperty("formatVersion");
    expect(json).toHaveProperty("dashboard");
    expect(json.formatVersion).toBe(1);
    expect(json.dashboard).toHaveProperty("name");
  });
});

// ---------------------------------------------------------------------------
// Dashboard import
// ---------------------------------------------------------------------------

test.describe("Dashboard import", () => {
  test("should import a NeoBoard format file", async ({ authPage, page }) => {
    test.setTimeout(60_000);
    await authPage.login(ALICE.email, ALICE.password);

    // Export "Movie Analytics" via API to get a valid export file
    const exportRes = await page.request.fetch("/api/dashboards");
    expect(exportRes.ok()).toBe(true);
    const dashboards = await exportRes.json();
    const movieAnalytics = (dashboards as { id: string; name: string }[]).find(
      (d) => d.name === "Movie Analytics",
    );
    expect(movieAnalytics).toBeTruthy();

    const exportFileRes = await page.request.fetch(
      `/api/dashboards/${movieAnalytics!.id}/export`,
    );
    expect(exportFileRes.ok()).toBe(true);
    const exportPayload = await exportFileRes.json();

    // Write to temp file
    const tmpFile = path.join(os.tmpdir(), `neoboard-test-import-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(exportPayload));

    try {
      // Click the "Import" button on the dashboard list page
      await page.getByRole("button", { name: "Import" }).click();
      const dialog = page.getByRole("dialog", { name: "Import Dashboard" });
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      // Upload the file
      const fileInput = dialog.locator("#import-file");
      await fileInput.setInputFiles(tmpFile);

      // Wait for the file to be parsed and preview to show
      await expect(dialog.getByText("NeoBoard format")).toBeVisible({ timeout: 5_000 });

      // Map connections — find Select triggers and map them
      // The import dialog should show connection mapping selectors
      const selects = dialog.locator("button[role='combobox']");
      const selectCount = await selects.count();

      for (let i = 0; i < selectCount; i++) {
        await selects.nth(i).click();
        // Select the first available option
        await expect(async () => {
          await page.getByRole("option").first().click({ timeout: 2_000 });
        }).toPass({ timeout: 10_000 });
      }

      // Click Import submit button
      const importBtn = dialog.getByRole("button", { name: "Import" }).last();
      await expect(importBtn).toBeEnabled({ timeout: 5_000 });
      await importBtn.click();

      // Should redirect to the imported dashboard
      await page.waitForURL(/\/[\w-]+$/, { timeout: 15_000 });

      // The dashboard should render content
      await expect(page.getByText(/Movie Analytics/)).toBeVisible({ timeout: 15_000 });

      // Clean up imported dashboard to avoid polluting other tests
      const url = page.url();
      const importedId = url.split("/").pop();
      if (importedId) {
        await page.request.delete(`/api/dashboards/${importedId}`);
      }
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // ignore
      }
    }
  });
});
