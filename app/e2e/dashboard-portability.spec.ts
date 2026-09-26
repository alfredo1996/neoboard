import { test, expect, ALICE, TEST_PG_PORT } from "./fixtures";
import { AuthPage } from "./pages/auth";
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

  test("a creator exports their dashboard on another user's shared connection (#2000)", async ({
    browser,
  }) => {
    // The export's connection lookup was scoped to connections the caller
    // OWNS, so a widget on a colleague's shared connection made it 500.
    test.setTimeout(60_000);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const connectionName = `export-shared-${suffix}`;
    const dashboardName = `Export shared ${suffix}`;
    const email = `export-creator-${suffix}@example.com`;
    const password = "password123";
    const adminContext = await browser.newContext();
    const creatorContext = await browser.newContext();
    const admin = await adminContext.newPage();
    let creatorId: string | undefined;
    let connectionId: string | undefined;
    try {
      await new AuthPage(admin).login(ALICE.email, ALICE.password);
      const userRes = await admin.request.post("/api/users", {
        data: { name: `Export ${suffix}`, email, password, role: "creator" },
      });
      expect(userRes.status()).toBe(201);
      creatorId = (await userRes.json()).data.id;
      const connRes = await admin.request.post("/api/connections", {
        data: {
          name: connectionName,
          type: "postgresql",
          config: {
            uri: `postgresql://localhost:${TEST_PG_PORT}`,
            username: "neoboard",
            password: "neoboard",
            database: "movies",
          },
        },
      });
      expect(connRes.status()).toBe(201);
      connectionId = (await connRes.json()).data.id;
      const shareRes = await admin.request.patch(
        `/api/connections/${connectionId}`,
        { data: { visibility: "shared" } },
      );
      expect(shareRes.ok()).toBe(true);

      const creator = await creatorContext.newPage();
      await new AuthPage(creator).login(email, password);
      const dashRes = await creator.request.post("/api/dashboards", {
        data: { name: dashboardName },
      });
      expect(dashRes.ok()).toBe(true);
      const dashboardId = (await dashRes.json()).data.id;
      const layoutRes = await creator.request.put(
        `/api/dashboards/${dashboardId}`,
        {
          data: {
            layoutJson: {
              version: 2,
              pages: [
                {
                  id: "p1",
                  title: "Page 1",
                  widgets: [
                    {
                      id: "w1",
                      chartType: "table",
                      connectionId,
                      query: "SELECT 1 AS one",
                    },
                  ],
                  gridLayout: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
                },
              ],
            },
          },
        },
      );
      expect(layoutRes.ok()).toBe(true);

      await creator.goto("/");
      const card = creator
        .locator("div[class*='cursor-pointer']")
        .filter({ hasText: dashboardName })
        .first();
      await expect(card).toBeVisible({ timeout: 10_000 });
      await card.getByRole("button", { name: "Dashboard options" }).click();
      const downloadPromise = creator.waitForEvent("download");
      await creator.getByRole("menuitem", { name: "Export" }).click();
      const download = await downloadPromise;
      const json = JSON.parse(
        fs.readFileSync((await download.path())!, "utf-8"),
      );
      expect(Object.values(json.connections)).toContainEqual({
        name: connectionName,
        type: "postgresql",
      });
    } finally {
      // Deleting the creator removes their dashboard with them.
      if (creatorId) await admin.request.delete(`/api/users/${creatorId}`);
      if (connectionId) {
        await admin.request.delete(
          `/api/connections/${connectionId}?force=true`,
        );
      }
      await creatorContext.close();
      await adminContext.close();
    }
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

      // Post-success view replaces the form (no auto-redirect). Click
      // "View dashboard" to navigate to the imported one.
      await page
        .getByRole("button", { name: "View dashboard" })
        .click({ timeout: 15_000 });
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

    // NeoDash imports now synthesize a single Neo4j placeholder that needs
    // to be mapped or skipped. Skip it here — this test asserts chart-type
    // conversion, not connection wiring (widgets render whether or not they
    // have a real connection).
    await dialog.locator('label:has-text("Skip")').first().click();

    // Import button should be enabled once the only placeholder is skipped
    const importBtn = dialog.getByRole("button", { name: "Import" }).last();
    await expect(importBtn).toBeEnabled({ timeout: 5_000 });
    await importBtn.click();

    // Post-success view replaces the form with the import notes. The fixture's
    // circle_packing report is one of the types NeoBoard no longer ships, so
    // it is dropped and the user told why (#1687).
    await expect(
      page.getByText(
        '"Genre Hierarchy" (circle_packing) → unsupported in NeoBoard, skipped',
      ),
    ).toBeVisible({ timeout: 15_000 });
    await page
      .getByRole("button", { name: "View dashboard" })
      .click({ timeout: 15_000 });
    await page.waitForURL(/\/[\w-]+$/, { timeout: 15_000 });

    // Verify 7 widget cards rendered — the 8 reports minus the skipped
    // circle_packing one; includes gantt and graph3d→graph.
    // Report titles are now preserved as widget settings.title
    await expect(page.locator("[data-testid='widget-card']")).toHaveCount(7, {
      timeout: 15_000,
    });

    // Clean up imported dashboard
    const importedId = page.url().split("/").pop();
    if (importedId) {
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

      // Skip the synthesized Neo4j placeholder — this test cares about the
      // fallback chart-type behavior, not the connection wiring.
      await dialog.locator('label:has-text("Skip")').first().click();

      const importBtn = dialog.getByRole("button", { name: "Import" }).last();
      await expect(importBtn).toBeEnabled();
      await importBtn.click();

      // Should import without crashing — unknown type falls back to JSON viewer.
      // Assert the widget card renders (proves import succeeded and the fallback
      // chart type didn't blow up). We don't look for "JSON Viewer" text because
      // the chart type label isn't always rendered as visible text on the card.
      await page
        .getByRole("button", { name: "View dashboard" })
        .click({ timeout: 15_000 });
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
});
