import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  saveDashboard,
  typeInEditor,
} from "./fixtures";

test.describe("Dashboard viewer — uncovered states", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("should show 404 empty state for nonexistent dashboard", async ({
    page,
  }) => {
    await page.goto("/nonexistent-dashboard-id-12345");
    await expect(page.getByText("Dashboard not found")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText("doesn't exist or you don't have access"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Back to Dashboards/ }),
    ).toBeVisible();
  });

  test("unmatched route shows the branded not-found page, not a stock 404 (#1047)", async ({
    page,
  }) => {
    // A sub-route with no match (there's no dashboards/[id] route) used to
    // fall through to Next's unstyled default page.
    await page.goto("/dashboards/00000000-0000-0000-0000-000000000000");

    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("link", { name: "Go to dashboards" }),
    ).toBeVisible();
    // Not the stock Next.js page.
    await expect(page.getByText("This page could not be found")).toHaveCount(0);
  });

  test("should show empty state when dashboard has no widgets", async ({
    page,
  }) => {
    // Its own empty dashboard, deleted by id however the test ends (#1784).
    const name = `Empty State ${Date.now()}`;
    const { id, cleanup } = await createTestDashboard(page.request, name);
    try {
      await page.goto(`/${id}/edit`);
      await expect(
        page.getByRole("heading", { name: `Editing: ${name}`, exact: true }),
      ).toBeVisible({ timeout: 10_000 });
      // Save the empty dashboard, and wait for it to land before leaving (#1767)
      await saveDashboard(page);
      // Go to view mode. /\/[\w-]+$/ also matched /<id>/edit, and "No widgets
      // yet" shows in edit mode too, so assert view-only chrome (#1787).
      await page.getByRole("button", { name: /Back/ }).click();
      await page.waitForURL((url) => !url.pathname.endsWith("/edit"), {
        timeout: 10_000,
      });
      await expect(
        page.getByRole("button", { name: "Edit", exact: true }),
      ).toBeVisible({ timeout: 10_000 });
      // Should show the view-mode empty state
      await expect(page.getByText("No widgets yet")).toBeVisible();
      await expect(page.getByText("This page has no widgets.")).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test("should navigate to dashboard and display content", async ({ page }) => {
    await page.getByText("Movie Analytics", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await expect(page.getByText("Movie Analytics")).toBeVisible();
  });

  test("search filters the dashboards list and shows an empty state (#1048)", async ({
    page,
  }) => {
    const search = page.getByRole("searchbox", { name: "Search dashboards" });
    await expect(page.getByText("Movie Analytics")).toBeVisible({
      timeout: 10_000,
    });

    // Narrowing the search keeps the matching card visible.
    await search.fill("Movie");
    await expect(page.getByText("Movie Analytics")).toBeVisible();

    // A query that matches nothing shows the empty-result message.
    await search.fill("zzz-no-such-dashboard");
    await expect(page.getByText(/No dashboards match/i)).toBeVisible();
    await expect(page.getByText("Movie Analytics")).not.toBeVisible();
  });

  test("does NOT show 'Dashboard updated by' banner after a self-save + revisit (#904)", async ({
    page,
  }) => {
    // Create a fresh dashboard
    const name = `Self-Save Test ${Date.now()}`;
    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#dashboard-name").fill(name);
    const [created] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/dashboards") &&
          r.request().method() === "POST" &&
          r.status() === 201,
        { timeout: 10_000 },
      ),
      dialog.getByRole("button", { name: "Create" }).click(),
    ]);
    // The id from the create response, deleted however the test ends (#1784).
    const dashboardId = (await created.json()).data.id as string;
    const versionKey = `__nb_dash_ver_${dashboardId}`;

    try {
      await page.waitForURL(/\/edit/, { timeout: 15_000 });

      // Create lands in edit mode, which stores no version baseline. Visit
      // view mode first so it does; without one, a missing #904 fix shows the
      // banner only when view mode happens to render the cached pre-save
      // version before the refetch (#1787).
      await page.goto(`/${dashboardId}`);
      const editButton = page.getByRole("button", {
        name: "Edit",
        exact: true,
      });
      await expect(editButton).toBeVisible({ timeout: 15_000 });
      await page.waitForFunction(
        (k) => sessionStorage.getItem(k) !== null,
        versionKey,
      );
      await editButton.click();
      await expect(
        page.getByRole("heading", { name: `Editing: ${name}`, exact: true }),
      ).toBeVisible({ timeout: 15_000 });

      // Save — bumps the version server-side. With #904's fix, the hook's
      // onSuccess writes the new version to sessionStorage so the subsequent
      // view-mode load sees a fresh baseline and doesn't fire the banner.
      const [saved] = await Promise.all([
        page.waitForResponse(
          (r) =>
            /\/api\/dashboards\/[\w-]+$/.test(r.url()) &&
            r.request().method() === "PUT" &&
            r.status() === 200,
          { timeout: 10_000 },
        ),
        page.getByRole("button", { name: "Save" }).click(),
      ]);
      const savedVersion = String((await saved.json()).data.version);

      // Leave edit → view mode (the route where the version-bump effect runs)
      await page.getByRole("button", { name: /Back/ }).click();
      // Back goes to /<id>, not /dashboards. /\/[\w-]+$/ also matched
      // /<id>/edit, so wait for view mode and its chrome (#1787).
      await page.waitForURL((url) => !url.pathname.endsWith("/edit"), {
        timeout: 10_000,
      });
      await expect(
        page.getByRole("button", { name: "Edit", exact: true }),
      ).toBeVisible({ timeout: 10_000 });

      // View mode's baseline is now the saved version: written by #904's fix
      // on save, or by the version-bump effect as it raises the banner.
      await page.waitForFunction(
        ([k, v]) => sessionStorage.getItem(k) === v,
        [versionKey, savedVersion],
      );

      // Critical assertion: NO "Dashboard updated by" banner
      await expect(page.getByText(/Dashboard updated by/i)).toHaveCount(0);
    } finally {
      await page.request.delete(`/api/dashboards/${dashboardId}`);
    }
  });
});

test.describe("Dashboard editor — uncovered states", () => {
  // Each test's own dashboard, deleted by id afterwards (#1784).
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.afterEach(async () => {
    await dashboardCleanup?.();
    dashboardCleanup = undefined;
  });

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const name = `Editor Test ${Date.now()}`;
    const { id, cleanup } = await createTestDashboard(page.request, name);
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(
      page.getByRole("heading", { name: `Editing: ${name}`, exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("should show empty state in editor with Add Widget CTA", async ({
    page,
  }) => {
    await expect(page.getByText("No widgets yet")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText('Click "Add Widget" to get started.'),
    ).toBeVisible();
    const emptyStateBtn = page.getByRole("button", { name: "Add Widget" });
    await expect(emptyStateBtn.first()).toBeVisible();
  });

  test("should manage pages — add page", async ({ page }) => {
    await expect(page.getByText("Page 1")).toBeVisible();
    await page.getByRole("button", { name: "Add page" }).click();
    await expect(page.getByText("Page 2")).toBeVisible({ timeout: 5_000 });
  });

  test("admin should see Sharing button in editor toolbar", async ({
    page,
  }) => {
    await expect(page.getByRole("button", { name: "Sharing" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("admin should open sharing panel via sheet", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Sharing" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Sharing" }).click();
    await expect(page.getByText("Sharing").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("should rename a page via inline input", async ({ page }) => {
    await expect(page.getByText("Page 1")).toBeVisible();
    // Hover over the Page 1 tab and open options
    await page
      .getByRole("button", { name: "Page options for Page 1" })
      .click({ force: true });
    await page.getByText("Rename").click();

    // The inline rename input should appear — fill in new name
    const renameInput = page.locator("input[class*='text-sm']").last();
    await renameInput.fill("Overview");
    await page.keyboard.press("Enter");

    // Tab text should change to "Overview"
    await expect(page.getByText("Overview")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Page 1")).not.toBeVisible();
  });

  test("should delete a page when multiple pages exist", async ({ page }) => {
    await expect(page.getByText("Page 1")).toBeVisible();
    // Add a second page
    await page.getByRole("button", { name: "Add page" }).click();
    await expect(page.getByText("Page 2")).toBeVisible({ timeout: 5_000 });

    // Open page options for Page 2 and delete
    await page
      .getByRole("button", { name: "Page options for Page 2" })
      .click({ force: true });
    await page.getByText("Delete page").click();

    // Page 2 should be gone, Page 1 still visible
    await expect(page.getByText("Page 2")).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Page 1")).toBeVisible();
  });

  test("should navigate between pages in view mode", async ({ page }) => {
    test.setTimeout(90_000);
    // Add a widget on Page 1
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Single Value" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    await typeInEditor(dialog, page, "RETURN 42 AS answer");
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Add a second page
    await page.getByRole("button", { name: "Add page" }).click();
    await expect(page.getByText("Page 2")).toBeVisible({ timeout: 5_000 });
    // Click on Page 2 tab
    await page.getByText("Page 2").click();

    // Add widget on Page 2
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog2 = page.getByRole("dialog", { name: "Add Widget" });
    await dialog2.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();
    await dialog2.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await typeInEditor(dialog2, page, "MATCH (m:Movie) RETURN m.title LIMIT 3");
    await dialog2.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog2).not.toBeVisible({ timeout: 5_000 });

    // Save, and wait for it to land before navigating away (#1767)
    await saveDashboard(page);

    // Go to view mode — extract dashboard ID from URL and navigate directly
    const editUrl = page.url();
    const viewUrl = editUrl.replace(/\/edit$/, "");
    await page.goto(viewUrl);
    await page.waitForURL(/\/[\w-]+$/, { timeout: 15_000 });

    // Both page tabs should be visible
    await expect(page.getByText("Page 1")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Page 2")).toBeVisible();

    // Widget from Page 1 should be visible initially
    await expect(
      page.locator("[data-testid='widget-card']").first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
