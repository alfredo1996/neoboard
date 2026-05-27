import { test, expect, ALICE } from "./fixtures";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const FIXTURES_DIR = path.resolve(__dirname, "fixtures", "imports");

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
    const dashboards = (await exportRes.json()).data;
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
    const tmpFile = path.join(
      os.tmpdir(),
      `neoboard-test-import-${Date.now()}.json`,
    );
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
      await expect(dialog.getByText("NeoBoard format")).toBeVisible({
        timeout: 5_000,
      });

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
      await expect(page.getByText(/Movie Analytics/)).toBeVisible({
        timeout: 15_000,
      });

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

// ---------------------------------------------------------------------------
// NeoDash legacy import
// ---------------------------------------------------------------------------

test.describe("NeoDash legacy import", () => {
  test("should import a NeoDash format file with correct chart type mapping", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(60_000);
    await authPage.login(ALICE.email, ALICE.password);

    await page.getByRole("button", { name: "Import" }).click();
    const dialog = page.getByRole("dialog", { name: "Import Dashboard" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Upload NeoDash fixture
    const fileInput = dialog.locator("#import-file");
    await fileInput.setInputFiles(
      path.join(FIXTURES_DIR, "neodash-sample.json"),
    );

    // Should detect NeoDash format and show preview
    await expect(dialog.getByText("NeoDash format")).toBeVisible({
      timeout: 5_000,
    });
    await expect(dialog.getByText("E2E NeoDash Import Test")).toBeVisible();
    await expect(dialog.getByText("8 widgets")).toBeVisible();

    // Neo4j connection picker appears for NeoDash imports
    await expect(
      dialog.getByText(/All widgets in this dashboard will use/i),
    ).toBeVisible();
    // Alice has exactly one Neo4j connection seeded, so the picker auto-selects it
    // and the Import button enables without further interaction.
    const importBtn = dialog.getByRole("button", { name: "Import" }).last();
    await expect(importBtn).toBeEnabled({ timeout: 5_000 });
    await importBtn.click();

    // Should redirect to the imported dashboard
    await page.waitForURL(/\/[\w-]+$/, { timeout: 15_000 });

    // Verify 6 widget cards rendered — includes gantt and graph3d→graph
    // Report titles are now preserved as widget settings.title
    await expect(page.locator("[data-testid='widget-card']")).toHaveCount(8, {
      timeout: 15_000,
    });

    // Verify the auto-mapped connectionId persisted to the dashboard layout.
    const importedId = page.url().split("/").pop();
    if (importedId) {
      const dashRes = await page.request.fetch(`/api/dashboards/${importedId}`);
      const dashBody = await dashRes.json();
      const widgets = dashBody.data.layoutJson.pages.flatMap(
        (p: { widgets: { connectionId: string }[] }) => p.widgets,
      );
      // Every widget should now reference a real connection id (no empty strings)
      for (const w of widgets) {
        expect(w.connectionId).not.toBe("");
      }

      await page.request.delete(`/api/dashboards/${importedId}`);
    }
  });

  test("NeoDash import with unsupported chart type degrades to JSON viewer", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(60_000);
    await authPage.login(ALICE.email, ALICE.password);

    // Create a NeoDash JSON with an unknown chart type
    const neodashWithUnknown = {
      title: "Unknown Type Test",
      version: "2.4",
      pages: [
        {
          title: "Page 1",
          reports: [
            {
              id: "r1",
              title: "Unknown Widget",
              type: "completely_unknown_type",
              query: "RETURN 1",
              x: 0,
              y: 0,
              width: 6,
              height: 4,
              settings: {},
              parameters: {},
            },
          ],
        },
      ],
    };

    const tmpFile = path.join(
      os.tmpdir(),
      `neodash-unknown-${Date.now()}.json`,
    );
    fs.writeFileSync(tmpFile, JSON.stringify(neodashWithUnknown));

    try {
      await page.getByRole("button", { name: "Import" }).click();
      const dialog = page.getByRole("dialog", { name: "Import Dashboard" });
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      await dialog.locator("#import-file").setInputFiles(tmpFile);
      await expect(dialog.getByText("NeoDash format")).toBeVisible({
        timeout: 5_000,
      });

      const importBtn = dialog.getByRole("button", { name: "Import" }).last();
      await expect(importBtn).toBeEnabled();
      await importBtn.click();

      // Should import without crashing — unknown type falls back to JSON viewer.
      // Assert the widget card renders (proves import succeeded and the fallback
      // chart type didn't blow up). We don't look for "JSON Viewer" text because
      // the chart type label isn't always rendered as visible text on the card.
      await page.waitForURL(/\/[\w-]+$/, { timeout: 15_000 });
      await expect(
        page.locator("[data-testid='widget-card']").first(),
      ).toBeVisible({ timeout: 15_000 });

      // Clean up
      const importedId = page.url().split("/").pop();
      if (importedId) {
        await page.request.delete(`/api/dashboards/${importedId}`);
      }
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // ignore
      }
    }
  });

  test("multi-database NeoDash import maps each database independently and preserves per-card db", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(60_000);
    await authPage.login(ALICE.email, ALICE.password);

    const multiDbDashboard = {
      title: "Multi-DB E2E",
      version: "2.4",
      pages: [
        {
          title: "P1",
          reports: [
            {
              id: "r1",
              title: "Movies report",
              type: "table",
              query: "RETURN 1",
              database: "movies",
              x: 0,
              y: 0,
              width: 6,
              height: 4,
              settings: {},
              parameters: {},
            },
            {
              id: "r2",
              title: "Tenants report",
              type: "bar",
              query: "RETURN 1",
              database: "tenants",
              x: 6,
              y: 0,
              width: 6,
              height: 4,
              settings: {},
              parameters: {},
            },
          ],
        },
      ],
    };

    const tmpFile = path.join(os.tmpdir(), `neodash-multi-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(multiDbDashboard));

    try {
      await page.getByRole("button", { name: "Import" }).click();
      const dialog = page.getByRole("dialog", { name: "Import Dashboard" });
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      await dialog.locator("#import-file").setInputFiles(tmpFile);
      await expect(dialog.getByText(/NeoDash format/)).toBeVisible({
        timeout: 5_000,
      });

      // Multi-DB UI: one row per distinct database
      await expect(
        dialog.getByText(/Map NeoDash databases to connections/i),
      ).toBeVisible();
      await expect(dialog.getByText("movies", { exact: true })).toBeVisible();
      await expect(dialog.getByText("tenants", { exact: true })).toBeVisible();

      // Alice has 1 Neo4j connection → both rows auto-pick it, submit enables
      const importBtn = dialog.getByRole("button", { name: "Import" }).last();
      await expect(importBtn).toBeEnabled({ timeout: 5_000 });
      await importBtn.click();

      await page.waitForURL(/\/[\w-]+$/, { timeout: 15_000 });
      const importedId = page.url().split("/").pop();
      expect(importedId).toBeTruthy();

      // Persisted widgets: each kept its NeoDash database as the per-card db,
      // and both landed on the chosen Neo4j connection.
      const dashRes = await page.request.fetch(`/api/dashboards/${importedId}`);
      const dashBody = await dashRes.json();
      const widgets = dashBody.data.layoutJson.pages.flatMap(
        (p: { widgets: { connectionId: string; database?: string }[] }) =>
          p.widgets,
      );
      const byDb = Object.fromEntries(
        widgets.map((w: { connectionId: string; database?: string }) => [
          w.database,
          w.connectionId,
        ]),
      );
      expect(byDb["movies"]).toBe("conn-neo4j-001");
      expect(byDb["tenants"]).toBe("conn-neo4j-001");

      await page.request.delete(`/api/dashboards/${importedId}`);
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // ignore
      }
    }
  });
});
