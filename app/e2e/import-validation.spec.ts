import * as path from "node:path";
import { test, expect, ALICE } from "./fixtures";

const FIXTURES_DIR = path.resolve(__dirname, "fixtures", "imports");

function fixturePath(name: string) {
  return path.join(FIXTURES_DIR, name);
}

async function openImportDialog(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Import" }).click();
  const dialog = page.getByRole("dialog", { name: "Import Dashboard" });
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  return dialog;
}

test.describe("Dashboard import validation", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("rejects malformed JSON with a user-facing error", async ({ page }) => {
    const dialog = await openImportDialog(page);

    await dialog
      .locator("#import-file")
      .setInputFiles(fixturePath("malformed.txt"));

    await expect(dialog.locator("text=Failed to parse file")).toBeVisible({
      timeout: 5_000,
    });

    // Import button should remain disabled (no parsed data)
    await expect(
      dialog.getByRole("button", { name: "Import" }).last(),
    ).toBeDisabled();
  });

  test("rejects export missing required fields with a validation error", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    const dialog = await openImportDialog(page);

    await dialog
      .locator("#import-file")
      .setInputFiles(fixturePath("missing-fields.json"));

    // Client parses it (formatVersion === 1) and shows a preview
    await expect(dialog.getByText("Incomplete Export")).toBeVisible({
      timeout: 5_000,
    });
    await expect(dialog.getByText("0 widgets")).toBeVisible();

    // No connections to map → Import button should be enabled
    const importBtn = dialog.getByRole("button", { name: "Import" }).last();
    await expect(importBtn).toBeEnabled();

    // Submit — server-side Zod validation rejects the incomplete payload
    await importBtn.click();

    // Error message should appear in the dialog (not an alert)
    await expect(dialog.locator(".text-destructive")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows connection mapping UI for unknown connections", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const dialog = await openImportDialog(page);

    await dialog
      .locator("#import-file")
      .setInputFiles(fixturePath("two-connections.json"));

    // Preview should show dashboard name and format
    await expect(dialog.getByText("Two-Connection Dashboard")).toBeVisible({
      timeout: 5_000,
    });
    await expect(dialog.getByText("NeoBoard format")).toBeVisible();
    await expect(dialog.getByText("2 widgets")).toBeVisible();

    // Connection mapping section should appear
    await expect(dialog.getByText("Graph DB")).toBeVisible();
    await expect(dialog.getByText("Relational DB")).toBeVisible();

    // Two combobox selects for mapping
    const selects = dialog.locator("button[role='combobox']");
    await expect(selects).toHaveCount(2);

    // Import button should be disabled until all connections are mapped
    const importBtn = dialog.getByRole("button", { name: "Import" }).last();
    await expect(importBtn).toBeDisabled();
  });

  test("blocks import when only one of two connections is mapped", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const dialog = await openImportDialog(page);

    await dialog
      .locator("#import-file")
      .setInputFiles(fixturePath("two-connections.json"));

    await expect(dialog.getByText("Two-Connection Dashboard")).toBeVisible({
      timeout: 5_000,
    });

    // Map only the first connection (neo4j)
    const selects = dialog.locator("button[role='combobox']");
    await selects.first().click();
    await expect(async () => {
      await page.getByRole("option").first().click({ timeout: 2_000 });
    }).toPass({ timeout: 10_000 });

    // Import button should still be disabled (second connection unmapped)
    const importBtn = dialog.getByRole("button", { name: "Import" }).last();
    await expect(importBtn).toBeDisabled();
  });

  test("imports successfully when all connections are mapped", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const dialog = await openImportDialog(page);

    await dialog
      .locator("#import-file")
      .setInputFiles(fixturePath("two-connections.json"));

    await expect(dialog.getByText("Two-Connection Dashboard")).toBeVisible({
      timeout: 5_000,
    });

    // Map both connections
    const selects = dialog.locator("button[role='combobox']");
    const selectCount = await selects.count();
    expect(selectCount).toBe(2);

    for (let i = 0; i < selectCount; i++) {
      await selects.nth(i).click();
      await expect(async () => {
        await page.getByRole("option").first().click({ timeout: 2_000 });
      }).toPass({ timeout: 10_000 });
    }

    // Import button should now be enabled
    const importBtn = dialog.getByRole("button", { name: "Import" }).last();
    await expect(importBtn).toBeEnabled({ timeout: 5_000 });
    await importBtn.click();

    // Should redirect to the imported dashboard
    await page.waitForURL(/\/[\w-]+$/, { timeout: 15_000 });

    // Dashboard should render with the imported widgets
    await expect(page.getByText("Neo4j Widget")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("PostgreSQL Widget")).toBeVisible();

    // Clean up the imported dashboard
    const importedId = page.url().split("/").pop();
    if (importedId) {
      await page.request.delete(`/api/dashboards/${importedId}`);
    }
  });
});
