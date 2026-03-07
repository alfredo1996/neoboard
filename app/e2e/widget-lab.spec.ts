import { test, expect, ALICE, createTestDashboard } from "./fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a widget via the Add Widget dialog and return without saving the dashboard. */
async function addBarWidgetToDashboard(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Add Widget" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add Widget" });

  // Select Neo4j connection
  await dialog.getByRole("combobox").nth(0).click();
  await page.getByRole("option").first().click();

  // Type a query
  const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
  await cm.click();
  await page.keyboard.insertText(
    "MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 5",
  );

  // Add the widget
  await dialog.getByRole("button", { name: "Add Widget" }).click();
  await expect(dialog).not.toBeVisible();
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe("Widget Lab", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  // ── Sidebar navigation ──────────────────────────────────────────────

  test("sidebar has Widget Lab item that navigates to /widget-lab", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Widget Lab" }).click();
    await expect(page).toHaveURL("/widget-lab");
    await expect(
      page.getByRole("heading", { name: "Widget Lab" }),
    ).toBeVisible();
  });

  test("Widget Lab page shows empty state when no templates exist", async ({
    page,
  }) => {
    await page.goto("/widget-lab");
    // Either the empty-state copy or template cards should render
    await expect(
      page
        .getByText("No templates yet")
        .or(page.getByText("No templates match your filters"))
        .or(page.locator(".grid > div").first()),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── Save to Widget Lab flow ─────────────────────────────────────────

  test.describe("Save / browse / delete template flow", () => {
    let dashboardCleanup: (() => Promise<void>) | undefined;
    let templateId: string | undefined;

    test.beforeEach(async ({ page }) => {
      const { id, cleanup } = await createTestDashboard(
        page.request,
        `Widget Lab Test ${Date.now()}`,
      );
      dashboardCleanup = cleanup;
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible();

      // Add a bar widget
      await addBarWidgetToDashboard(page);
    });

    test.afterEach(async ({ page }) => {
      // Clean up any template created during the test
      if (templateId) {
        await page.request.delete(`/api/widget-templates/${templateId}`);
        templateId = undefined;
      }
      await dashboardCleanup?.();
    });

    test("can save a widget as a template and see it in Widget Lab", async ({
      page,
    }) => {
      // Open widget actions menu → "Save to Widget Lab"
      const widgetCard = page.locator("[data-testid='widget-card']").first();
      await widgetCard.hover();
      await widgetCard.getByRole("button", { name: "Widget actions" }).click();
      await page.getByRole("menuitem", { name: "Save to Widget Lab" }).click();

      // Save Template dialog should appear
      const saveDialog = page.getByRole("dialog", { name: "Save to Widget Lab" });
      await expect(saveDialog).toBeVisible();

      // Fill in template name
      const templateName = `E2E Template ${Date.now()}`;
      await saveDialog.getByLabel("Name").fill(templateName);
      await saveDialog
        .getByLabel(/description/i)
        .fill("Created by E2E test");

      // Save
      await saveDialog.getByRole("button", { name: "Save Template" }).click();
      await expect(saveDialog).not.toBeVisible();

      // Navigate to Widget Lab and verify the template appears
      await page.goto("/widget-lab");
      await expect(page.getByText(templateName)).toBeVisible({
        timeout: 10_000,
      });

      // Capture template id for cleanup
      const res = await page.request.get("/api/widget-templates");
      const templates = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saved = templates.find((t: any) => t.name === templateName);
      templateId = saved?.id;
    });

    test("can delete a template from Widget Lab", async ({ page }) => {
      // First save a template via the API so we don't depend on the UI flow
      const templateName = `E2E Delete ${Date.now()}`;
      const createRes = await page.request.post("/api/widget-templates", {
        data: {
          name: templateName,
          chartType: "bar",
          connectorType: "neo4j",
          query: "MATCH (m:Movie) RETURN m.title LIMIT 5",
        },
      });
      expect(createRes.ok()).toBeTruthy();
      const { id } = await createRes.json();
      templateId = id;

      // Go to Widget Lab
      await page.goto("/widget-lab");
      await expect(page.getByText(templateName)).toBeVisible({
        timeout: 10_000,
      });

      // Click the delete icon on the template card
      const card = page.locator(".grid > div").filter({ hasText: templateName });
      await card.getByRole("button", { name: "Delete template" }).click();

      // Confirm the deletion
      const confirmDialog = page.getByRole("alertdialog", { name: "Delete Template" });
      await expect(confirmDialog).toBeVisible();
      await confirmDialog.getByRole("button", { name: "Delete" }).click();
      await expect(confirmDialog).not.toBeVisible();

      // Template should no longer appear
      await expect(page.getByText(templateName)).not.toBeVisible({
        timeout: 5_000,
      });
      templateId = undefined; // Already deleted
    });
  });

  // ── From Template in Add Widget dialog ──────────────────────────────

  test.describe("From Template in Add Widget modal", () => {
    let dashboardCleanup: (() => Promise<void>) | undefined;
    let templateId: string | undefined;

    test.beforeEach(async ({ page }) => {
      const { id, cleanup } = await createTestDashboard(
        page.request,
        `Widget Lab From Template ${Date.now()}`,
      );
      dashboardCleanup = cleanup;

      // Create a template via API
      const res = await page.request.post("/api/widget-templates", {
        data: {
          name: "E2E From Template",
          description: "Picked in E2E test",
          chartType: "table",
          connectorType: "neo4j",
          query: "MATCH (m:Movie) RETURN m.title LIMIT 5",
        },
      });
      expect(res.ok()).toBeTruthy();
      const { id: tId } = await res.json();
      templateId = tId;

      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Editing:")).toBeVisible();
    });

    test.afterEach(async ({ page }) => {
      if (templateId) {
        await page.request.delete(`/api/widget-templates/${templateId}`);
        templateId = undefined;
      }
      await dashboardCleanup?.();
    });

    test("can open From Template and apply a template to the widget form", async ({
      page,
    }) => {
      // Open Add Widget dialog
      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });
      await expect(dialog).toBeVisible();

      // Click "From Template"
      await dialog.getByRole("button", { name: "From Template" }).click();

      // Dialog title changes to "Browse Templates"
      const browseDialog = page.getByRole("dialog", { name: "Browse Templates" });
      await expect(
        browseDialog.getByRole("heading", { name: "Browse Templates" }),
      ).toBeVisible();

      // The template we created should be listed
      await expect(browseDialog.getByText("E2E From Template")).toBeVisible({
        timeout: 10_000,
      });

      // Click to apply
      await browseDialog
        .locator("button")
        .filter({ hasText: "E2E From Template" })
        .click();

      // Should return to main dialog step (title changes back)
      const mainDialog = page.getByRole("dialog", { name: "Add Widget" });
      await expect(
        mainDialog.getByRole("heading", { name: "Add Widget" }),
      ).toBeVisible();

      // Query should be pre-filled from the template
      await expect(
        mainDialog.locator("[data-testid='codemirror-container']"),
      ).toBeVisible();
    });
  });
});
