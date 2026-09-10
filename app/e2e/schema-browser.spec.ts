/**
 * E2E: schema browser panel in the widget editor (#1693).
 *
 * Against the seeded databases: open the panel, find a label / table, insert
 * it at the editor cursor (mid-document, not at the end), and run the query.
 */
import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  getPreview,
  typeInEditor,
} from "./fixtures";
import type { Locator } from "@playwright/test";

const RUN_BUTTON = "Run query (Ctrl+Enter / ⌘+Enter)";

/** Put the editor cursor at `pos` — `typeInEditor` does not position it. */
async function placeCursor(dialog: Locator, pos: number) {
  await dialog
    .locator("[data-testid='codemirror-container']")
    .evaluate((el: HTMLElement, anchor: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (el as any).__cmView.dispatch({ selection: { anchor } });
    }, pos);
}

/** The live CM6 document — what the panel's click actually produced. */
function editorDoc(dialog: Locator) {
  return dialog
    .locator("[data-testid='codemirror-container']")
    .evaluate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (el: HTMLElement) => (el as any).__cmView?.state.doc.toString() ?? "",
    );
}

test.describe("Schema browser (#1693)", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.setTimeout(60_000);

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Schema Browser ${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(
      page.getByRole("heading", { name: /^Editing:/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add Widget" }).first().click();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("is hidden until a connection is chosen, then toggles open", async ({
    page,
  }) => {
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    await expect(
      dialog.getByRole("button", { name: "Schema", exact: true }),
    ).not.toBeVisible();

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    const toggle = dialog.getByRole("button", { name: "Schema", exact: true });
    await expect(toggle).toBeVisible({ timeout: 5_000 });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(dialog.getByTestId("schema-browser")).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(dialog.getByTestId("schema-browser")).toBeVisible();

    await toggle.click();
    await expect(dialog.getByTestId("schema-browser")).toHaveCount(0);
  });

  test("Neo4j: inserts a label at the cursor and the query runs", async ({
    page,
  }) => {
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    // The first connection option is the seeded Neo4j instance.
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();

    await dialog.getByRole("button", { name: "Schema", exact: true }).click();
    const browser = dialog.getByTestId("schema-browser");
    // Labels appear once the schema fetch lands in the store.
    await expect(
      browser.getByRole("button", { name: "Movie", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(browser.getByText("Relationship types")).toBeVisible();

    // Properties are one chevron away, with their type alongside.
    await browser.getByRole("button", { name: "Expand Movie" }).click();
    await expect(
      browser.getByRole("button", { name: /^title\b/ }),
    ).toBeVisible();

    // Cursor sits right after the ":" — insertion must land there, not at the end.
    const before = "MATCH (n:) RETURN n.title AS title ORDER BY title";
    await typeInEditor(dialog, page, before);
    await placeCursor(dialog, "MATCH (n:".length);
    await browser.getByRole("button", { name: "Movie", exact: true }).click();
    await expect
      .poll(() => editorDoc(dialog))
      .toBe("MATCH (n:Movie) RETURN n.title AS title ORDER BY title");

    await expect(dialog.getByTitle(RUN_BUTTON)).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByTitle(RUN_BUTTON).click();
    await expect(getPreview(dialog)).toBeVisible({ timeout: 15_000 });
    await expect(
      dialog.locator("th").filter({ hasText: "title" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(dialog.locator("tbody tr").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("PostgreSQL: search narrows to matching columns and inserts one", async ({
    page,
  }) => {
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /PostgreSQL/i }).click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();

    await dialog.getByRole("button", { name: "Schema", exact: true }).click();
    const browser = dialog.getByTestId("schema-browser");
    await expect(
      browser.getByRole("button", { name: "movies", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      browser.getByRole("button", { name: "people", exact: true }),
    ).toBeVisible();

    // A search keeps only the tables with a matching column, expanded to it.
    await browser.getByRole("searchbox", { name: "Search schema" }).fill("tit");
    await expect(
      browser.getByRole("button", { name: "people", exact: true }),
    ).toHaveCount(0);
    const titleColumn = browser.getByRole("button", { name: /^title\b/ });
    await expect(titleColumn).toBeVisible();

    const before = "SELECT  FROM movies";
    await typeInEditor(dialog, page, before);
    await placeCursor(dialog, "SELECT ".length);
    await titleColumn.click();
    await expect.poll(() => editorDoc(dialog)).toBe("SELECT title FROM movies");

    await expect(dialog.getByTitle(RUN_BUTTON)).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByTitle(RUN_BUTTON).click();
    await expect(getPreview(dialog)).toBeVisible({ timeout: 15_000 });
    await expect(
      dialog.locator("th").filter({ hasText: "title" }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
