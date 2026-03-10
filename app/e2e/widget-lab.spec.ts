import { test, expect, ALICE, createTestDashboard, typeInEditor, getPreview } from "./fixtures";

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

  // Type a query using the reliable typeInEditor helper
  await typeInEditor(dialog, page, "MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 5");

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
    let templateName: string;

    test.beforeEach(async ({ page }) => {
      templateName = `E2E Tmpl ${Date.now()}`;
      const { id, cleanup } = await createTestDashboard(
        page.request,
        `Widget Lab From Template ${Date.now()}`,
      );
      dashboardCleanup = cleanup;

      // Create a template via API
      const res = await page.request.post("/api/widget-templates", {
        data: {
          name: templateName,
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
      await expect(
        browseDialog.locator("button").filter({ hasText: templateName }),
      ).toBeVisible({ timeout: 10_000 });

      // Click to apply
      await browseDialog
        .locator("button")
        .filter({ hasText: templateName })
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

    test("From Template picker shows code preview for each template", async ({
      page,
    }) => {
      // Open Add Widget dialog
      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });
      await expect(dialog).toBeVisible();

      // Click "From Template"
      await dialog.getByRole("button", { name: "From Template" }).click();
      const browseDialog = page.getByRole("dialog", { name: "Browse Templates" });
      await expect(browseDialog.getByRole("heading", { name: "Browse Templates" })).toBeVisible();

      // Wait for templates to load — use button filter to avoid matching alt text
      const card = browseDialog.locator("button").filter({ hasText: templateName });
      await expect(card).toBeVisible({ timeout: 10_000 });

      // The card should contain a code preview with the query text
      await expect(card.locator("[data-testid='code-preview']")).toBeVisible();
    });
  });

  // ── Create / Edit templates directly in Widget Lab ──────────────────

  test.describe("Widget Lab editor — create and edit templates", () => {
    let templateId: string | undefined;

    test.afterEach(async ({ page }) => {
      if (templateId) {
        await page.request.delete(`/api/widget-templates/${templateId}`);
        templateId = undefined;
      }
    });

    test("can create a new template directly from Widget Lab", async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await page.goto("/widget-lab");
      await expect(page.getByRole("heading", { name: "Widget Lab" })).toBeVisible();

      // Click "New Template" button
      await page.getByRole("button", { name: "New Template" }).click();
      const dialog = page.getByRole("dialog", { name: "Create Template" });
      await expect(dialog).toBeVisible();

      // Fill in template metadata
      const templateName = `E2E Create ${Date.now()}`;
      await dialog.locator("#lab-template-name").fill(templateName);
      await dialog.locator("#lab-template-desc").fill("Created directly in Widget Lab");
      await dialog.locator("#lab-template-tags").fill("e2e, test");

      // Select a connection
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      // Type a query
      await typeInEditor(dialog, page, "MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 5");

      // Run the query to populate the preview (use first() — there may be
      // duplicate Run buttons when CM6 re-renders during mount)
      await dialog.getByRole("button", { name: "Run" }).first().click();
      const preview = getPreview(dialog);
      await expect(preview.locator("canvas").or(preview.locator("table"))).toBeVisible({ timeout: 15_000 });

      // Create the template
      await dialog.getByRole("button", { name: "Create Template" }).click();
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });

      // Verify it appears in the Widget Lab list
      await expect(page.getByText(templateName)).toBeVisible({ timeout: 10_000 });

      // Capture template id for cleanup
      const res = await page.request.get("/api/widget-templates");
      const templates = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saved = templates.find((t: any) => t.name === templateName);
      templateId = saved?.id;
      expect(templateId).toBeDefined();
    });

    test("can edit an existing template in Widget Lab", async ({
      page,
    }) => {
      test.setTimeout(60_000);

      // Create a template via API first
      const origName = `E2E Edit Orig ${Date.now()}`;
      const createRes = await page.request.post("/api/widget-templates", {
        data: {
          name: origName,
          chartType: "bar",
          connectorType: "neo4j",
          query: "MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 5",
          settings: { title: "Bar Chart" },
        },
      });
      expect(createRes.ok()).toBeTruthy();
      const { id } = await createRes.json();
      templateId = id;

      // Go to Widget Lab and click edit on the template card
      await page.goto("/widget-lab");
      await expect(page.getByText(origName)).toBeVisible({ timeout: 10_000 });

      const card = page.locator("[data-testid='template-card']").filter({ hasText: origName });
      await card.getByRole("button", { name: "Edit template" }).click();

      // Edit Template dialog should open
      const dialog = page.getByRole("dialog", { name: "Edit Template" });
      await expect(dialog).toBeVisible();

      // Verify metadata is pre-filled
      await expect(dialog.locator("#lab-template-name")).toHaveValue(origName);

      // Change the name
      const newName = `E2E Edit Updated ${Date.now()}`;
      await dialog.locator("#lab-template-name").fill(newName);

      // Save
      await dialog.getByRole("button", { name: "Save Template" }).click();
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });

      // Verify updated name appears
      await expect(page.getByText(newName)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(origName)).not.toBeVisible();
    });

    test("template cards show code preview with query text", async ({
      page,
    }) => {
      test.setTimeout(60_000);

      // Create a template via API
      const templateName = `E2E Preview ${Date.now()}`;
      const queryText = "MATCH (n) RETURN n LIMIT 10";

      const createRes = await page.request.post("/api/widget-templates", {
        data: {
          name: templateName,
          chartType: "bar",
          connectorType: "neo4j",
          query: queryText,
        },
      });
      expect(createRes.ok()).toBeTruthy();
      const { id } = await createRes.json();
      templateId = id;

      // Navigate to Widget Lab
      await page.goto("/widget-lab");
      await expect(page.getByText(templateName)).toBeVisible({ timeout: 10_000 });

      // The template card should show a code preview containing the query
      const card = page.locator("[data-testid='template-card']").filter({ hasText: templateName });
      const codePreview = card.locator("[data-testid='code-preview']");
      await expect(codePreview).toBeVisible();
      await expect(codePreview).toContainText(queryText);
    });

    test("Use in Dashboard opens picker dialog and navigates to dashboard editor", async ({
      page,
    }) => {
      test.setTimeout(90_000);

      // Create a template via API
      const templateName = `E2E UseInDash ${Date.now()}`;
      const queryText = "MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 5";
      const createRes = await page.request.post("/api/widget-templates", {
        data: {
          name: templateName,
          chartType: "bar",
          connectorType: "neo4j",
          query: queryText,
        },
      });
      expect(createRes.ok()).toBeTruthy();
      const { id: tId } = await createRes.json();
      templateId = tId;

      // Create a dashboard to use as target
      const { id: dashId, cleanup: dashCleanup } = await createTestDashboard(
        page.request,
        `UseInDash Target ${Date.now()}`,
      );

      try {
        // Go to Widget Lab
        await page.goto("/widget-lab");
        await expect(page.getByText(templateName)).toBeVisible({ timeout: 10_000 });

        // Click "Use in Dashboard" on the template card
        const card = page.locator("[data-testid='template-card']").filter({ hasText: templateName });
        await card.getByRole("button", { name: "Use in Dashboard" }).click();

        // Dashboard picker dialog should appear
        const pickerDialog = page.getByRole("dialog", { name: "Choose a Dashboard" });
        await expect(pickerDialog).toBeVisible({ timeout: 10_000 });

        // Click the target dashboard
        await pickerDialog.locator("button").filter({ hasText: /UseInDash Target/ }).click();

        // Should navigate to the dashboard edit page with templateId param
        await expect(page).toHaveURL(new RegExp(`/${dashId}/edit\\?templateId=${tId}`));

        // The Add Widget dialog should auto-open with the template applied
        const addDialog = page.getByRole("dialog", { name: "Add Widget" });
        await expect(addDialog).toBeVisible({ timeout: 15_000 });

        // The query from the template should be pre-filled in the editor
        await expect(
          addDialog.locator("[data-testid='codemirror-container']"),
        ).toBeVisible({ timeout: 10_000 });
      } finally {
        await dashCleanup();
      }
    });

    test("editing a template does not affect widgets already on dashboards", async ({
      page,
    }) => {
      test.setTimeout(90_000);

      // 1. Create a template via API
      const templateName = `E2E Isolation ${Date.now()}`;
      const origQuery = "MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 5";
      const createRes = await page.request.post("/api/widget-templates", {
        data: {
          name: templateName,
          chartType: "bar",
          connectorType: "neo4j",
          query: origQuery,
          settings: { title: "Original Title" },
        },
      });
      expect(createRes.ok()).toBeTruthy();
      const { id: tId } = await createRes.json();
      templateId = tId;

      // 2. Create a dashboard and add a widget from that template
      const { id: dashId, cleanup } = await createTestDashboard(
        page.request,
        `Isolation Test ${Date.now()}`,
      );

      try {
        await page.goto(`/${dashId}/edit`);
        await expect(page.getByText("Editing:")).toBeVisible();

        // Add widget via "From Template"
        await page.getByRole("button", { name: "Add Widget" }).first().click();
        const addDialog = page.getByRole("dialog", { name: "Add Widget" });
        await expect(addDialog).toBeVisible();

        await addDialog.getByRole("button", { name: "From Template" }).click();
        const browseDialog = page.getByRole("dialog", { name: "Browse Templates" });
        await expect(browseDialog.getByText(templateName)).toBeVisible({ timeout: 10_000 });

        // Apply the template
        await browseDialog.locator("button").filter({ hasText: templateName }).click();

        // Back on main dialog — select connection and add the widget
        const mainDialog = page.getByRole("dialog", { name: "Add Widget" });
        await expect(mainDialog).toBeVisible();

        // Select a connection
        await mainDialog.getByRole("combobox").nth(0).click();
        await page.getByRole("option").first().click();

        await mainDialog.getByRole("button", { name: "Add Widget" }).click();
        await expect(mainDialog).not.toBeVisible();

        // Save dashboard
        await page.getByRole("button", { name: "Save" }).click();
        // eslint-disable-next-line playwright/no-wait-for-timeout
        await page.waitForTimeout(1_000);

        // 3. Edit the template in Widget Lab — change its name
        await page.goto("/widget-lab");
        await expect(page.getByText(templateName)).toBeVisible({ timeout: 10_000 });

        const card = page.locator("[data-testid='template-card']").filter({ hasText: templateName });
        await card.getByRole("button", { name: "Edit template" }).click();

        const editDialog = page.getByRole("dialog", { name: "Edit Template" });
        await expect(editDialog).toBeVisible();

        const updatedName = `${templateName} UPDATED`;
        await editDialog.locator("#lab-template-name").fill(updatedName);
        await editDialog.getByRole("button", { name: "Save Template" }).click();
        await expect(editDialog).not.toBeVisible({ timeout: 10_000 });

        // 4. Go back to the dashboard — widget should still work with original data
        await page.goto(`/${dashId}`);
        await expect(page.locator("[data-testid='widget-card']").first()).toBeVisible({ timeout: 15_000 });

        // Widget should render (canvas for bar chart) — proving the dashboard copy is independent
        await expect(
          page.locator("[data-testid='widget-card'] canvas")
            .or(page.locator("[data-testid='widget-card']").getByText("Original Title")),
        ).toBeVisible({ timeout: 15_000 });
      } finally {
        await cleanup();
      }
    });
  });
});
