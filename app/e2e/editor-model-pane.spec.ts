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

    await page
      .getByRole("button", { name: "Add Widget", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Add Widget",
      exact: true,
    });
    const model = dialog.getByRole("button", { name: "Model", exact: true });
    await expect(model).toBeDisabled();

    await dialog
      .getByRole("combobox", { name: "Connection", exact: true })
      .click();
    await page.getByRole("option", { name: /Movies Graph/ }).click();
    await expect(model).toBeEnabled();

    await typeInEditor(dialog, page, "MATCH (m:Movie) RETURN m.");
    const cm = dialog.locator("[data-testid='codemirror-container']");

    await model.click();
    const pane = dialog.getByRole("radio", {
      name: "Model",
      exact: true,
      checked: true,
    });
    await expect(pane).toBeVisible();
    await dialog
      .getByRole("button", { name: "Open Movie", exact: true })
      .click();
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
      dialog.getByRole("radio", {
        name: "Preview",
        exact: true,
        checked: true,
      }),
    ).toBeVisible();
    // The query ran: the default bar chart reports the one column (title) it got back.
    await expect(dialog.getByTestId("widget-preview")).toContainText(
      "returned only 1 column",
    );
  });

  test("a SQL foreign key shows the tables it joins and inserts nothing", async ({
    page,
    authPage,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Model Pane FK ${uid()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(editingCrumb(page)).toBeVisible({ timeout: 10_000 });

    await page
      .getByRole("button", { name: "Add Widget", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Add Widget",
      exact: true,
    });
    await dialog
      .getByRole("combobox", { name: "Connection", exact: true })
      .click();
    await page
      .getByRole("option", { name: /Movies DB \(PostgreSQL\)/ })
      .click();
    await dialog.getByRole("button", { name: "Model", exact: true }).click();

    await expect(
      dialog.getByText("roles → people", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: /person_id/ })).toHaveCount(
      0,
    );
    // A table is still a name to insert.
    await expect(
      dialog.getByTitle("Insert people", { exact: true }),
    ).toBeVisible();
  });
});
