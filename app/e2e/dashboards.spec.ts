import { test, expect, ALICE } from "./fixtures";

test.describe("Dashboard CRUD", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  // Defensive cleanup: delete any "Movie Analytics (copy)" dashboards left
  // behind by the "should duplicate a dashboard" test. If that test's
  // inline cleanup path throws (e.g. dropdown click races), the copy can
  // leak across tests and cause strict-mode `getByText("Movie Analytics")`
  // collisions elsewhere. This afterEach runs via the API (no UI race) and
  // is idempotent, so the cost is one GET + at most one DELETE per test.
  test.afterEach(async ({ page }) => {
    try {
      const res = await page.request.get("/api/dashboards?limit=100");
      if (!res.ok()) return;
      const body = await res.json();
      const copies = (
        (body.data ?? []) as Array<{ id: string; name: string }>
      ).filter((d) => d.name === "Movie Analytics (copy)");
      for (const copy of copies) {
        await page.request.delete(`/api/dashboards/${copy.id}`);
      }
    } catch {
      // Best-effort cleanup — never fail the test on this path.
    }
  });

  test("should create a new dashboard", async ({ page }) => {
    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const dialog = page.getByRole("dialog", { name: "Create Dashboard" });
    await dialog.locator("#dashboard-name").fill("E2E Test Dashboard");
    await dialog.getByRole("button", { name: "Create" }).click();
    // After creation, app navigates to edit page
    await expect(page.getByText("E2E Test Dashboard")).toBeVisible({
      timeout: 10000,
    });
  });

  test("should open dashboard in view mode", async ({ page }) => {
    // Use exact match to avoid substring collision with any stray
    // "Movie Analytics (copy)" left by a parallel duplicate test.
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
    // Find the "Movie Analytics" card and open its dropdown
    const dashCard = page
      .locator("div[class*='cursor-pointer']")
      .filter({ hasText: "Movie Analytics" })
      .first();
    await expect(dashCard).toBeVisible({ timeout: 10_000 });
    await dashCard.getByRole("button", { name: "Dashboard options" }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();

    // A copy card should appear
    await expect(page.getByText("Movie Analytics (copy)")).toBeVisible({
      timeout: 15_000,
    });
    // Original should still be visible
    await expect(page.getByText("Movie Analytics").first()).toBeVisible();

    // Clean up — delete the copy to avoid polluting other tests
    const copyCard = page
      .locator("div[class*='cursor-pointer']")
      .filter({ hasText: "Movie Analytics (copy)" })
      .first();
    await copyCard.getByRole("button", { name: "Dashboard options" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Movie Analytics (copy)")).not.toBeVisible({
      timeout: 5_000,
    });
  });
});
