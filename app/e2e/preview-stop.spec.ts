import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  typeInEditor,
  editingCrumb,
  SEEDED_PG_OPTION,
  uid,
} from "./fixtures";

// The editor preview's Run turns into Stop while a query runs (#2445).
test.describe("Stopping a slow preview", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("Stop shows the stopped state at once, and Run starts a new run", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Stop preview ${uid()}`,
    );
    try {
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
      await page.getByRole("option", { name: SEEDED_PG_OPTION }).click();
      await typeInEditor(dialog, page, "SELECT pg_sleep(20), 1 AS n");

      let sent = 0;
      page.on("request", (r) => {
        if (new URL(r.url()).pathname === "/api/query") sent++;
      });

      await dialog.getByRole("button", { name: "Run", exact: true }).click();
      const stop = dialog.getByRole("button", { name: "Stop", exact: true });
      await expect(stop).toBeVisible();
      await expect(dialog.getByRole("status")).toContainText(
        "Loading preview…",
      );
      await stop.click();

      await expect(
        dialog.getByText("Query stopped", { exact: true }),
      ).toBeVisible({ timeout: 1_000 });
      const run = dialog.getByRole("button", { name: "Run", exact: true });
      await expect(run).toBeEnabled();

      const before = sent;
      await run.click();
      await expect(
        dialog.getByRole("button", { name: "Stop", exact: true }),
      ).toBeVisible();
      expect(sent).toBe(before + 1);
    } finally {
      await cleanup();
    }
  });
});
