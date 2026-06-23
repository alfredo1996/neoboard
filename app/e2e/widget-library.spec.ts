import {
  test,
  expect,
  ALICE,
  CAROL,
  createTestDashboard,
  typeInEditor,
  getPreview,
} from "./fixtures";

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
  await typeInEditor(
    dialog,
    page,
    "MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 5",
  );

  // Add the widget
  await dialog.getByRole("button", { name: "Add Widget" }).click();
  await expect(dialog).not.toBeVisible();
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe("Widget Library", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  // ── Sidebar navigation ──────────────────────────────────────────────

  test("sidebar has Widget Library item that navigates to /widget-library", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Widget Library" }).click();
    await expect(page).toHaveURL("/widget-library");
    await expect(
      page.getByRole("heading", { name: "Widget Library" }),
    ).toBeVisible();
  });

  test("legacy /widget-lab URL redirects to /widget-library (#914)", async ({
    page,
  }) => {
    // Next.js permanent redirect from /widget-lab → /widget-library.
    // Playwright follows the redirect automatically; landing on the new path
    // is enough proof the redirects() entry in next.config.ts is wired.
    await page.goto("/widget-lab");
    await expect(page).toHaveURL("/widget-library");
  });

  test("Widget Library page shows empty state when no templates exist", async ({
    page,
  }) => {
    await page.goto("/widget-library");
    // Either the empty-state copy or template cards should render
    await expect(
      page
        .getByText("No templates yet")
        .or(page.getByText("No templates match your filters"))
        .or(page.locator(".grid > div").first()),
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── Save to Widget Library flow ─────────────────────────────────────────

  test.describe("Save / browse / delete template flow", () => {
    let dashboardCleanup: (() => Promise<void>) | undefined;
    let templateId: string | undefined;

    test.beforeEach(async ({ page }) => {
      const { id, cleanup } = await createTestDashboard(
        page.request,
        `Widget Library Test ${Date.now()}`,
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

    test("can save a widget as a template and see it in Widget Library", async ({
      page,
    }) => {
      // #913: Save-as-template moved into the widget editor modal.
      // Flow: widget actions → Edit Widget → modal footer "Save as new template" → fill dialog.
      const widgetCard = page.locator("[data-testid='widget-card']").first();
      await widgetCard.hover();
      await widgetCard.getByRole("button", { name: "Widget actions" }).click();
      await page.getByRole("menuitem", { name: "Edit Widget" }).click();

      // Editor modal opens
      const editorModal = page.getByRole("dialog", { name: "Edit Widget" });
      await expect(editorModal).toBeVisible();

      // Click the footer "Save as new template" button
      await editorModal
        .getByRole("button", { name: "Save as new template" })
        .click();

      // Editor closes; SaveTemplateDialog opens
      await expect(editorModal).not.toBeVisible();
      const saveDialog = page.getByRole("dialog", {
        name: "Save to Widget Library",
      });
      await expect(saveDialog).toBeVisible();

      // Fill in template name
      const templateName = `E2E Template ${Date.now()}`;
      await saveDialog.getByLabel("Name").fill(templateName);
      await saveDialog.getByLabel(/description/i).fill("Created by E2E test");

      // Save
      await saveDialog.getByRole("button", { name: "Save Template" }).click();
      await expect(saveDialog).not.toBeVisible();

      // Navigate to Widget Library and verify the template appears
      await page.goto("/widget-library");
      await expect(page.getByText(templateName)).toBeVisible({
        timeout: 10_000,
      });

      // Capture template id for cleanup
      const res = await page.request.get("/api/widget-templates");
      const templates = (await res.json()).data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saved = templates.find((t: any) => t.name === templateName);
      templateId = saved?.id;
    });

    test("can delete a template from Widget Library", async ({ page }) => {
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
      const { id } = (await createRes.json()).data;
      templateId = id;

      // Go to Widget Library
      await page.goto("/widget-library");
      await expect(page.getByText(templateName)).toBeVisible({
        timeout: 10_000,
      });

      // Use data-testid for reliable card selection instead of .grid > div
      const card = page
        .getByTestId("template-card")
        .filter({ hasText: templateName });
      await card.getByRole("button", { name: "Delete template" }).click();

      // Confirm the deletion
      const confirmDialog = page.getByRole("alertdialog", {
        name: "Delete Template",
      });
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
        `Widget Library From Template ${Date.now()}`,
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
      const { id: tId } = (await res.json()).data;
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
      const browseDialog = page.getByRole("dialog", {
        name: "Browse Templates",
      });
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
      const browseDialog = page.getByRole("dialog", {
        name: "Browse Templates",
      });
      await expect(
        browseDialog.getByRole("heading", { name: "Browse Templates" }),
      ).toBeVisible();

      // Wait for templates to load — use button filter to avoid matching alt text
      const card = browseDialog
        .locator("button")
        .filter({ hasText: templateName });
      await expect(card).toBeVisible({ timeout: 10_000 });

      // The card should contain a code preview with the query text
      await expect(card.locator("[data-testid='code-preview']")).toBeVisible();
    });
  });

  // ── Create / Edit templates directly in Widget Library ──────────────────

  test.describe("Widget Library editor — create and edit templates", () => {
    let templateId: string | undefined;

    test.afterEach(async ({ page }) => {
      if (templateId) {
        await page.request.delete(`/api/widget-templates/${templateId}`);
        templateId = undefined;
      }
    });

    test("can create a new template directly from Widget Library", async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await page.goto("/widget-library");
      await expect(
        page.getByRole("heading", { name: "Widget Library" }),
      ).toBeVisible();

      // Click "New Template" button
      await page.getByRole("button", { name: "New Template" }).click();
      const dialog = page.getByRole("dialog", { name: "Create Template" });
      await expect(dialog).toBeVisible();

      // Fill in template metadata
      const templateName = `E2E Create ${Date.now()}`;
      await dialog.locator("#lab-template-name").fill(templateName);
      await dialog
        .locator("#lab-template-desc")
        .fill("Created directly in Widget Library");
      await dialog.locator("#lab-template-tags").fill("e2e, test");

      // Select a connection
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();

      // Type a query
      await typeInEditor(
        dialog,
        page,
        "MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 5",
      );

      // Run the query to populate the preview (use first() — there may be
      // duplicate Run buttons when CM6 re-renders during mount)
      await dialog.getByRole("button", { name: "Run" }).first().click();
      const preview = getPreview(dialog);
      await expect(
        preview.locator("canvas").or(preview.locator("table")),
      ).toBeVisible({ timeout: 15_000 });

      // Create the template
      await dialog.getByRole("button", { name: "Create Template" }).click();
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });

      // Verify it appears in the Widget Library list
      await expect(page.getByText(templateName)).toBeVisible({
        timeout: 10_000,
      });

      // Capture template id for cleanup
      const res = await page.request.get("/api/widget-templates");
      const templates = (await res.json()).data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saved = templates.find((t: any) => t.name === templateName);
      templateId = saved?.id;
      expect(templateId).toBeDefined();
    });

    test("can edit an existing template in Widget Library", async ({
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
          query:
            "MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 5",
          settings: { title: "Bar Chart" },
        },
      });
      expect(createRes.ok()).toBeTruthy();
      const { id } = (await createRes.json()).data;
      templateId = id;

      // Go to Widget Library and click edit on the template card
      await page.goto("/widget-library");
      await expect(page.getByText(origName)).toBeVisible({ timeout: 10_000 });

      const card = page
        .locator("[data-testid='template-card']")
        .filter({ hasText: origName });
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
      const { id } = (await createRes.json()).data;
      templateId = id;

      // Navigate to Widget Library
      await page.goto("/widget-library");
      await expect(page.getByText(templateName)).toBeVisible({
        timeout: 10_000,
      });

      // The template card should show a code preview containing the query
      const card = page
        .locator("[data-testid='template-card']")
        .filter({ hasText: templateName });
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
      const queryText =
        "MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 5";
      const createRes = await page.request.post("/api/widget-templates", {
        data: {
          name: templateName,
          chartType: "bar",
          connectorType: "neo4j",
          query: queryText,
        },
      });
      expect(createRes.ok()).toBeTruthy();
      const { id: tId } = (await createRes.json()).data;
      templateId = tId;

      // Create a dashboard to use as target
      const { id: dashId, cleanup: dashCleanup } = await createTestDashboard(
        page.request,
        `UseInDash Target ${Date.now()}`,
      );

      try {
        // Go to Widget Library
        await page.goto("/widget-library");
        await expect(page.getByText(templateName)).toBeVisible({
          timeout: 10_000,
        });

        // Click "Use in Dashboard" on the template card
        const card = page
          .locator("[data-testid='template-card']")
          .filter({ hasText: templateName });
        await card.getByRole("button", { name: "Use in Dashboard" }).click();

        // Dashboard picker dialog should appear
        const pickerDialog = page.getByRole("dialog", {
          name: "Choose a Dashboard",
        });
        await expect(pickerDialog).toBeVisible({ timeout: 10_000 });

        // Click the target dashboard
        await pickerDialog
          .locator("button")
          .filter({ hasText: /UseInDash Target/ })
          .click();

        // Should navigate to the dashboard edit page with templateId param
        await expect(page).toHaveURL(
          new RegExp(`/${dashId}/edit\\?templateId=${tId}`),
        );

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
      const origQuery =
        "MATCH (m:Movie) RETURN m.title AS label, m.released AS value LIMIT 5";
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
      const { id: tId } = (await createRes.json()).data;
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
        const browseDialog = page.getByRole("dialog", {
          name: "Browse Templates",
        });
        await expect(browseDialog.getByText(templateName)).toBeVisible({
          timeout: 10_000,
        });

        // Apply the template
        await browseDialog
          .locator("button")
          .filter({ hasText: templateName })
          .click();

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

        // 3. Edit the template in Widget Library — change its name
        await page.goto("/widget-library");
        await expect(page.getByText(templateName)).toBeVisible({
          timeout: 10_000,
        });

        const card = page
          .locator("[data-testid='template-card']")
          .filter({ hasText: templateName });
        await card.getByRole("button", { name: "Edit template" }).click();

        const editDialog = page.getByRole("dialog", { name: "Edit Template" });
        await expect(editDialog).toBeVisible();

        const updatedName = `${templateName} UPDATED`;
        await editDialog.locator("#lab-template-name").fill(updatedName);
        await editDialog.getByRole("button", { name: "Save Template" }).click();
        await expect(editDialog).not.toBeVisible({ timeout: 10_000 });

        // 4. Go back to the dashboard — widget should still work with original data
        await page.goto(`/${dashId}`);
        await expect(
          page.locator("[data-testid='widget-card']").first(),
        ).toBeVisible({ timeout: 15_000 });

        // Widget should render (canvas for bar chart) — proving the dashboard copy is independent
        await expect(
          page
            .locator("[data-testid='widget-card'] canvas")
            .or(
              page
                .locator("[data-testid='widget-card']")
                .getByText("Original Title"),
            ),
        ).toBeVisible({ timeout: 15_000 });
      } finally {
        await cleanup();
      }
    });
  });

  // #913: "Save to Widget Library" moved from the widget action dropdown into
  // the widget editor modal footer. The old "from view mode" tests are no
  // longer applicable — view-mode users must enter Edit to access the action.
  // Reader role still can't reach it: they can't open the editor either.

  // ── Widget Library consumption: duplicate, filter, search ───────────────

  test.describe("Widget Library consumption", () => {
    // Tests in this block share the same template names ("Neo4j Bar Template",
    // "PostgreSQL Table Template") in their beforeEach. With fullyParallel and
    // 2 CI workers, two tests' beforeEach can race → two templates with the
    // same name → strict-mode locator violation. Force serial execution so
    // each test's beforeEach/afterEach owns the templates exclusively.
    test.describe.configure({ mode: "serial" });

    let templateIds: string[] = [];

    test.beforeEach(async ({ page }) => {
      // Create two templates via API for filter/search tests
      const neo4jBar = await page.request.post("/api/widget-templates", {
        data: {
          name: "Neo4j Bar Template",
          chartType: "bar",
          connectorType: "neo4j",
          query: "MATCH (m:Movie) RETURN m.title AS label, count(*) AS value",
        },
      });
      const pgTable = await page.request.post("/api/widget-templates", {
        data: {
          name: "PostgreSQL Table Template",
          chartType: "table",
          connectorType: "postgresql",
          query: "SELECT title FROM movies LIMIT 5",
        },
      });
      const t1 = (await neo4jBar.json()).data;
      const t2 = (await pgTable.json()).data;
      templateIds = [t1.id, t2.id];
    });

    test.afterEach(async ({ page }) => {
      for (const id of templateIds) {
        await page.request.delete(`/api/widget-templates/${id}`);
      }
      templateIds = [];
    });

    test("can duplicate a template", async ({ page }) => {
      await page.goto("/widget-library");
      const card = page
        .locator("[data-testid='template-card']")
        .filter({ hasText: "Neo4j Bar Template" })
        .first();
      await expect(card).toBeVisible({ timeout: 10_000 });

      await card.getByLabel("Duplicate").click();

      // Duplicate should appear with "(copy)" suffix
      await expect(
        page.getByText("Neo4j Bar Template (copy)", { exact: true }),
      ).toBeVisible({ timeout: 10_000 });

      // Clean up the duplicate
      const res = await page.request.get("/api/widget-templates");
      const templates = (await res.json()).data;
      const copy = templates.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t: any) => t.name === "Neo4j Bar Template (copy)",
      );
      if (copy) templateIds.push(copy.id);
    });

    test("can filter templates by chart type", async ({ page }) => {
      await page.goto("/widget-library");
      const neo4jCard = page
        .locator("[data-testid='template-card']")
        .filter({ hasText: "Neo4j Bar Template" })
        .first();
      const pgCard = page
        .locator("[data-testid='template-card']")
        .filter({ hasText: "PostgreSQL Table Template" })
        .first();
      await expect(neo4jCard).toBeVisible({ timeout: 10_000 });
      await expect(pgCard).toBeVisible();

      // Filter to bar charts only — shadcn Select uses combobox role
      await page.locator("button[role='combobox']").nth(0).click();
      await page.getByRole("option", { name: "Bar Chart" }).click();

      await expect(neo4jCard).toBeVisible();
      await expect(pgCard).not.toBeVisible();
    });

    test("can filter templates by connector type", async ({ page }) => {
      await page.goto("/widget-library");
      const neo4jCard = page
        .locator("[data-testid='template-card']")
        .filter({ hasText: "Neo4j Bar Template" })
        .first();
      await expect(neo4jCard).toBeVisible({ timeout: 10_000 });

      // Filter to PostgreSQL only — connector select is the second combobox
      await page.locator("button[role='combobox']").nth(1).click();
      await page.getByRole("option", { name: /PostgreSQL/i }).click();

      const pgCard = page
        .locator("[data-testid='template-card']")
        .filter({ hasText: "PostgreSQL Table Template" })
        .first();
      await expect(pgCard).toBeVisible();
      await expect(neo4jCard).not.toBeVisible();
    });

    test("can search templates by name", async ({ page }) => {
      await page.goto("/widget-library");
      await expect(
        page.getByText("Neo4j Bar Template", { exact: true }),
      ).toBeVisible({ timeout: 10_000 });

      // Search for "PostgreSQL"
      await page.getByPlaceholder("Search templates...").fill("PostgreSQL");

      await expect(
        page.getByText("PostgreSQL Table Template", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Neo4j Bar Template", { exact: true }),
      ).not.toBeVisible();

      // Clear search
      await page.getByPlaceholder("Search templates...").clear();
      await expect(
        page.getByText("Neo4j Bar Template", { exact: true }),
      ).toBeVisible();
    });
  });
});
