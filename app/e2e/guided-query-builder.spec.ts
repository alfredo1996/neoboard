/**
 * E2E: guided query builder in the widget editor (#1696).
 *
 * Against the seeded databases: build a chart from picks alone — source,
 * fields, a filter — watch the connector's text land in the editor, run it,
 * then save the widget, reload, and see the dashboard run it with the filter
 * value the widget binds itself (no parameter widget involved).
 */
import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  getPreview,
  saveDashboard,
} from "./fixtures";
import type { Locator } from "@playwright/test";

const RUN_BUTTON = "Run query (Ctrl+Enter / ⌘+Enter)";

/** The live CM6 document — what the builder actually wrote. */
function editorDoc(dialog: Locator) {
  return dialog.locator("[data-testid='codemirror-container']").evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (el: HTMLElement) => (el as any).__cmView?.state.doc.toString() ?? "",
  );
}

test.describe("Guided query builder (#1696)", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.setTimeout(90_000);

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Guided Builder ${Date.now()}`,
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

  test("Neo4j: a filtered bar chart from picks alone, previewed and saved", async ({
    page,
  }) => {
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    // Hidden until a connection is chosen (Bar Chart is the default type).
    await expect(
      dialog.getByRole("button", { name: "Guided", exact: true }),
    ).not.toBeVisible();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();

    const toggle = dialog.getByRole("button", { name: "Guided", exact: true });
    await expect(toggle).toBeVisible({ timeout: 5_000 });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    const builder = dialog.getByTestId("guided-query-builder");
    await expect(builder).toBeVisible();

    // Sources appear once the schema fetch lands.
    const source = builder.getByRole("combobox", { name: "Source" });
    await expect(source).toBeVisible({ timeout: 20_000 });
    await source.selectOption("Movie");
    await expect
      .poll(() => editorDoc(dialog))
      .toBe("MATCH (n:Movie)\nRETURN n\nLIMIT 100");

    await builder.getByRole("checkbox", { name: "title" }).click();
    await builder.getByRole("checkbox", { name: "released" }).click();
    await expect
      .poll(() => editorDoc(dialog))
      .toBe(
        "MATCH (n:Movie)\nRETURN n.title AS title, n.released AS released\nLIMIT 100",
      );

    // The filter value goes into a parameter, never the text.
    await builder
      .getByRole("combobox", { name: "Filter field" })
      .selectOption("released");
    await builder
      .getByRole("combobox", { name: "Filter operator" })
      .selectOption(">");
    await builder.getByRole("textbox", { name: "Filter value" }).fill("2000");
    await expect
      .poll(() => editorDoc(dialog))
      .toBe(
        "MATCH (n:Movie)\nWHERE n.released > $param_released\nRETURN n.title AS title, n.released AS released\nLIMIT 100",
      );

    // The preview binds the widget's own value — no "waiting for parameters".
    await expect(dialog.getByTitle(RUN_BUTTON)).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByTitle(RUN_BUTTON).click();
    const preview = getPreview(dialog);
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview.locator("canvas")).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/waiting for parameters/i)).toHaveCount(0);

    // Saved and reloaded, the dashboard runs it with the binding the widget
    // carries — proof the params survived the round trip, not just memory.
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();
    await saveDashboard(page);
    await page.reload();
    const card = page.locator("[data-testid='widget-card']").first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.locator("canvas")).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText(/waiting for parameters/i)).toHaveCount(0);
  });

  test("Neo4j: a digits-only contains filter searches text", async ({
    page,
  }) => {
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();

    const toggle = dialog.getByRole("button", { name: "Guided", exact: true });
    await expect(toggle).toBeVisible({ timeout: 5_000 });
    await toggle.click();
    const builder = dialog.getByTestId("guided-query-builder");
    const source = builder.getByRole("combobox", { name: "Source" });
    await expect(source).toBeVisible({ timeout: 20_000 });
    await source.selectOption("Movie");
    await builder.getByRole("checkbox", { name: "title" }).click();
    await builder
      .getByRole("combobox", { name: "Filter field" })
      .selectOption("title");
    await builder
      .getByRole("combobox", { name: "Filter operator" })
      .selectOption("contains");
    // "13" is all digits: it must still search as text, not bind an Integer.
    await builder.getByRole("textbox", { name: "Filter value" }).fill("13");
    await expect
      .poll(() => editorDoc(dialog))
      .toBe(
        "MATCH (n:Movie)\nWHERE toLower(toString(n.title)) CONTAINS toLower(toString($param_title))\nRETURN n.title AS title\nLIMIT 100",
      );

    await expect(dialog.getByTitle(RUN_BUTTON)).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByTitle(RUN_BUTTON).click();
    await expect(
      getPreview(dialog).getByRole("cell", { name: "Apollo 13", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("PostgreSQL: a filtered table from picks alone speaks SQL, saved and reloaded", async ({
    page,
  }) => {
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /PostgreSQL/i }).click();
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Data Table" }).click();

    const toggle = dialog.getByRole("button", { name: "Guided", exact: true });
    await expect(toggle).toBeVisible({ timeout: 5_000 });
    await toggle.click();
    const builder = dialog.getByTestId("guided-query-builder");
    const source = builder.getByRole("combobox", { name: "Source" });
    await expect(source).toBeVisible({ timeout: 20_000 });
    await source.selectOption("movies");
    await builder.getByRole("checkbox", { name: "title" }).click();
    await builder.getByRole("checkbox", { name: "released" }).click();
    await expect
      .poll(() => editorDoc(dialog))
      .toBe('SELECT "title", "released"\nFROM "movies"\nLIMIT 100');

    // The ILIKE spelling and the positional rewrite of a widget-bound param
    // both have to hold against a real PostgreSQL.
    await builder
      .getByRole("combobox", { name: "Filter field" })
      .selectOption("title");
    await builder
      .getByRole("combobox", { name: "Filter operator" })
      .selectOption("contains");
    await builder.getByRole("textbox", { name: "Filter value" }).fill("13");
    await expect
      .poll(() => editorDoc(dialog))
      .toBe(
        'SELECT "title", "released"\nFROM "movies"\nWHERE CAST("title" AS text) ILIKE \'%\' || $param_title || \'%\'\nLIMIT 100',
      );

    await expect(dialog.getByTitle(RUN_BUTTON)).toBeEnabled({
      timeout: 10_000,
    });
    await dialog.getByTitle(RUN_BUTTON).click();
    await expect(
      getPreview(dialog).getByRole("cell", { name: "Apollo 13", exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();
    await saveDashboard(page);
    await page.reload();
    const card = page.locator("[data-testid='widget-card']").first();
    await expect(
      card.getByRole("cell", { name: "Apollo 13", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText(/waiting for parameters/i)).toHaveCount(0);
  });

  test("stays out of the way for expert chart types", async ({ page }) => {
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();
    await expect(
      dialog.getByRole("button", { name: "Guided", exact: true }),
    ).toBeVisible({ timeout: 5_000 });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Graph" }).click();
    await expect(
      dialog.getByRole("button", { name: "Guided", exact: true }),
    ).not.toBeVisible();
  });
});
