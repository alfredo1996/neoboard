import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";

test.describe("Dashboard tags (#1692)", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("adds tags in Edit details, filters the list by one, and clears the filter", async ({
    page,
  }) => {
    // Their own dashboards and a tag only this run knows, deleted by id.
    const tag = `tag-${uid()}`;
    const tagged = `Tagged ${uid()}`;
    const plain = `Plain ${uid()}`;
    const a = await createTestDashboard(page.request, tagged);
    const b = await createTestDashboard(page.request, plain);

    try {
      await page.goto("/");
      const row = (name: string) =>
        page
          .getByRole("row")
          .filter({ has: page.getByText(name, { exact: true }) });
      await expect(row(tagged)).toBeVisible({ timeout: 10_000 });

      await row(tagged)
        .getByRole("button", {
          name: `Dashboard options for ${tagged}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("menuitem", { name: "Edit details…", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Edit details",
        exact: true,
      });
      await dialog
        .locator("#dashboard-details-tags")
        .fill(` ${tag} , ${tag.toUpperCase()},, finance `);
      await expect(dialog.getByText("Saves as", { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(
        page.getByText("Dashboard updated", { exact: true }),
      ).toBeVisible({ timeout: 5_000 });

      // The row shows both chips, the duplicate spelling dropped.
      await expect(row(tagged).getByText(tag, { exact: true })).toBeVisible();
      await expect(
        row(tagged).getByText("finance", { exact: true }),
      ).toBeVisible();

      // Pick the tag: only the tagged dashboard stays, and the line says why.
      await page
        .getByRole("combobox", { name: "Filter by tag", exact: true })
        .click();
      await page.getByRole("option", { name: tag, exact: true }).click();
      await expect(
        page.getByText(`Tag is ${tag}`, { exact: true }),
      ).toBeVisible();
      await expect(row(tagged)).toBeVisible();
      await expect(row(plain)).toHaveCount(0);

      // Removing the filter restores the list.
      await page
        .getByRole("button", { name: "Remove Tag filter", exact: true })
        .click();
      await expect(row(plain)).toBeVisible();
      await expect(row(tagged)).toBeVisible();
    } finally {
      await a.cleanup();
      await b.cleanup();
    }
  });
});
