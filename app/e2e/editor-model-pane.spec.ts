import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  typeInEditor,
  uid,
  editingCrumb,
} from "./fixtures";

/**
 * #1693 — the connection's model, browsable beside the query. The Model button
 * swaps the preview pane for the model; a click inserts a key at the cursor;
 * Run brings the preview back. The query editor is never covered.
 */
test.describe("Model pane in the widget editor (#1693)", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.afterEach(async () => {
    await dashboardCleanup?.();
    dashboardCleanup = undefined;
  });

  test("open Movie, click title: the editor holds it at the cursor, and Run brings the preview back", async ({
    page,
    authPage,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Model Pane ${uid()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(editingCrumb(page)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    const model = dialog.getByRole("button", { name: "Model", exact: true });
    await expect(model).toBeDisabled();

    await dialog
      .getByRole("combobox", { name: "Connection", exact: true })
      .click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();
    await expect(model).toBeEnabled();

    await typeInEditor(dialog, page, "MATCH (m:Movie) RETURN m.");
    const cm = dialog.locator("[data-testid='codemirror-container']");
    // The cursor goes at the end, after "m.".
    await cm.evaluate((el: HTMLElement) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const view = (el as any).__cmView;
      view.dispatch({ selection: { anchor: view.state.doc.length } });
    });

    await model.click();
    const pane = dialog.getByRole("tab", { name: "Model", selected: true });
    await expect(pane).toBeVisible();
    await dialog.getByRole("button", { name: "Open Movie" }).click();
    await dialog.getByRole("button", { name: /^title\b/ }).click();

    await expect(async () => {
      const doc = await cm.evaluate((el: HTMLElement) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (el as any).__cmView.state.doc.toString(),
      );
      expect(doc).toBe("MATCH (m:Movie) RETURN m.title");
    }).toPass({ timeout: 5_000 });
    // The pane stays open while inserting.
    await expect(pane).toBeVisible();

    await dialog.getByRole("button", { name: "Run", exact: true }).click();
    await expect(
      dialog.getByRole("tab", { name: "Preview", selected: true }),
    ).toBeVisible();
    await expect(dialog.getByTestId("widget-preview")).toBeVisible();
  });
});
