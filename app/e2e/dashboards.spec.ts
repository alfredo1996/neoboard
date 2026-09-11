import { test, expect, ALICE, createTestDashboard } from "./fixtures";

test.describe("Dashboard CRUD", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("should create a new dashboard", async ({ page }) => {
    // A name only this run knows, removed by id (#1768). A fixed name outlived
    // the test, so every later run matched its card and the dialog's
    // duplicate-name warning at once.
    const name = `E2E Test Dashboard ${Date.now()}`;
    let id: string | undefined;

    try {
      await page.getByRole("button", { name: /New Dashboard/i }).click();
      const dialog = page.getByRole("dialog", { name: "Create Dashboard" });
      await dialog.locator("#dashboard-name").fill(name);
      const [created] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith("/api/dashboards") &&
            r.request().method() === "POST",
        ),
        dialog.getByRole("button", { name: "Create" }).click(),
      ]);
      expect(created.status()).toBe(201);
      id = (await created.json()).data.id as string;

      // The app lands on the new dashboard's edit page.
      await page.waitForURL((url) => url.pathname === `/${id}/edit`);
      await expect(
        page.getByRole("heading", { name: `Editing: ${name}`, exact: true }),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      if (id) await page.request.delete(`/api/dashboards/${id}`);
    }
  });

  test("should open dashboard in view mode", async ({ page }) => {
    await page.getByText("Movie Analytics", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10000 });
    await expect(
      page.getByText("Movie Analytics", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible();
  });

  test("should open dashboard in edit mode", async ({ page }) => {
    await page.getByText("Movie Analytics", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.waitForURL(/\/edit/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: /^Editing:/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add Widget" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("should rename a dashboard via card dropdown (#1045)", async ({
    page,
  }) => {
    const original = `Rename Me ${Date.now()}`;
    const renamed = `${original} Renamed`;

    // Create a dashboard to rename.
    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const createDialog = page.getByRole("dialog", { name: "Create Dashboard" });
    await createDialog.locator("#dashboard-name").fill(original);
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/dashboards") &&
          r.request().method() === "POST" &&
          r.status() === 201,
        { timeout: 10_000 },
      ),
      createDialog.getByRole("button", { name: "Create" }).click(),
    ]);
    await page.waitForURL(/\/edit/, { timeout: 15_000 });
    await page.goto("/");

    const card = page
      .locator("div[class*='cursor-pointer']")
      .filter({ hasText: original })
      .first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByRole("button", { name: "Dashboard options" }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();

    const renameDialog = page.getByRole("dialog", { name: "Rename Dashboard" });
    await expect(renameDialog).toBeVisible({ timeout: 5_000 });
    // Pre-filled with the current name.
    await expect(renameDialog.locator("#dashboard-rename")).toHaveValue(
      original,
    );
    await renameDialog.locator("#dashboard-rename").fill(renamed);
    await renameDialog.getByRole("button", { name: "Save" }).click();

    await expect(
      page.getByText("Dashboard renamed", { exact: true }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(renamed)).toBeVisible({ timeout: 10_000 });
    // Survives reload (persisted, not just local state).
    await page.reload();
    await expect(page.getByText(renamed)).toBeVisible({ timeout: 10_000 });

    // Clean up.
    const renamedCard = page
      .locator("div[class*='cursor-pointer']")
      .filter({ hasText: renamed })
      .first();
    await renamedCard
      .getByRole("button", { name: "Dashboard options" })
      .click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
  });

  test("should delete a dashboard", async ({ page }) => {
    // Create one to delete. Await POST to avoid the create-then-wait race.
    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const dialog = page.getByRole("dialog", { name: "Create Dashboard" });
    await dialog.locator("#dashboard-name").fill("To Delete Dashboard");
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/dashboards") &&
          r.request().method() === "POST" &&
          r.status() === 201,
        { timeout: 10_000 },
      ),
      dialog.getByRole("button", { name: "Create" }).click(),
    ]);
    // After creation, app navigates to edit page — go back to list
    await page.waitForURL(/\/edit/, { timeout: 15_000 });
    await page.goto("/");
    await expect(page.getByText("To Delete Dashboard")).toBeVisible({
      timeout: 10000,
    });

    // Open the dashboard options dropdown (Delete is inside a DropdownMenu)
    const dashCard = page
      .locator("div[class*='cursor-pointer']")
      .filter({ hasText: "To Delete Dashboard" })
      .first();
    await expect(
      dashCard.getByRole("button", { name: "Dashboard options" }),
    ).toBeVisible({ timeout: 5_000 });
    await dashCard.getByRole("button", { name: "Dashboard options" }).click();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole("menuitem", { name: "Delete" }).click();
    // Confirm deletion in the confirmation dialog
    await page.getByRole("button", { name: "Delete" }).click();
    // Destructive actions confirm success (#1046) — exact match to avoid the
    // aria-live announcement duplicate.
    await expect(
      page.getByText("Dashboard deleted", { exact: true }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("To Delete Dashboard")).not.toBeVisible();
  });

  test("deleting a dashboard already deleted elsewhere removes its card (#1750)", async ({
    page,
  }) => {
    const name = `Deleted Elsewhere ${Date.now()}`;
    const { id } = await createTestDashboard(page.request, name);

    await page.goto("/");
    const card = page
      .locator("div[class*='cursor-pointer']")
      .filter({ has: page.getByText(name, { exact: true }) })
      .first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Someone else deletes it; this page still shows the card.
    const gone = await page.request.delete(`/api/dashboards/${id}`);
    expect(gone.ok()).toBe(true);

    await card.getByRole("button", { name: "Dashboard options" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const [deleted] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/dashboards/${id}`) &&
          r.request().method() === "DELETE",
      ),
      page.getByRole("button", { name: "Delete" }).click(),
    ]);
    expect(deleted.status()).toBe(404);

    await expect(
      page.getByText("Dashboard already deleted", { exact: true }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(name, { exact: true })).not.toBeVisible({
      timeout: 10_000,
    });
  });

  test("explicit Save confirms with a toast (#1046)", async ({ page }) => {
    await page.getByText("Movie Analytics", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.waitForURL(/\/edit/, { timeout: 15_000 });

    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("Dashboard saved", { exact: true }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("should duplicate a dashboard via card dropdown", async ({ page }) => {
    // Duplicate a dashboard only this test knows (#1749). A copy of the shared
    // "Movie Analytics" was visible to every test in the file, and the by-name
    // cleanup that followed each of them deleted it mid-run from the other
    // worker — after which the UI's own delete 404'd over a stale card.
    const source = `Duplicate Me ${Date.now()}`;
    const copyName = `${source} (copy)`;
    const { id: sourceId, cleanup } = await createTestDashboard(
      page.request,
      source,
    );
    let copyId: string | undefined;

    try {
      await page.goto("/");
      const sourceCard = page
        .locator("div[class*='cursor-pointer']")
        .filter({ has: page.getByText(source, { exact: true }) })
        .first();
      await sourceCard
        .getByRole("button", { name: "Dashboard options" })
        .click();
      const [duplicated] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/dashboards/${sourceId}/duplicate`) &&
            r.request().method() === "POST",
        ),
        page.getByRole("menuitem", { name: "Duplicate" }).click(),
      ]);
      expect(duplicated.status()).toBe(201);
      copyId = (await duplicated.json()).data.id as string;

      // The copy appears next to the original.
      await expect(page.getByText(copyName, { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(source, { exact: true })).toBeVisible();

      // Delete the copy through its card, and wait for the server to agree.
      const copyCard = page
        .locator("div[class*='cursor-pointer']")
        .filter({ has: page.getByText(copyName, { exact: true }) })
        .first();
      await copyCard.getByRole("button", { name: "Dashboard options" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      const [deleted] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/dashboards/${copyId}`) &&
            r.request().method() === "DELETE",
        ),
        page.getByRole("button", { name: "Delete" }).click(),
      ]);
      expect(deleted.ok()).toBe(true);
      await expect(page.getByText(copyName, { exact: true })).not.toBeVisible();
    } finally {
      // Deleting by id is idempotent: a 404 for the removed copy is fine.
      if (copyId) await page.request.delete(`/api/dashboards/${copyId}`);
      await cleanup();
    }
  });
});
