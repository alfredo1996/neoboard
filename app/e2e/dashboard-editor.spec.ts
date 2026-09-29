import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  saveDashboard,
} from "./fixtures";

/** A titled markdown widget: renders with no connection. */
function markdown(id: string, title: string) {
  return {
    id,
    chartType: "markdown",
    connectionId: "",
    query: "",
    settings: { title, chartOptions: { content: `## Body of ${title}` } },
  };
}

function pageOf(id: string, title: string, widgetTitles: string[]) {
  const widgets = widgetTitles.map((t, i) => markdown(`${id}-w${i}`, t));
  return {
    id,
    title,
    widgets,
    gridLayout: widgets.map((w, i) => ({
      i: w.id,
      x: i * 6,
      y: 0,
      w: 6,
      h: 4,
    })),
  };
}

// Remove widget and Delete page used to run on click (#2055): the only way
// back was to leave edit mode without saving, losing every other edit.
test.describe("Remove widget and Delete page ask first (#2055)", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("Remove: Escape keeps the widget through Save and a reload; confirming removes it for good", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Remove widget ${Date.now()}`,
    );
    try {
      await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [pageOf("p1", "Main", ["Keeper", "Doomed"])],
          },
        },
      });
      await page.goto(`/${id}/edit`);

      const keeper = page.locator('[data-widget-id="p1-w0"]');
      const doomed = page.locator('[data-widget-id="p1-w1"]');
      const actions = doomed.getByRole("button", { name: "Widget actions" });
      const ask = page.getByRole("alertdialog", { name: 'Remove "Doomed"?' });
      await expect(doomed).toBeVisible({ timeout: 15_000 });

      // ── Escape cancels, and focus goes back to the menu button ──────
      await actions.click();
      await page.getByRole("menuitem", { name: "Remove" }).click();
      await expect(ask).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(ask).toBeHidden();
      await expect(actions).toBeFocused();
      await expect(doomed).toBeVisible();

      await saveDashboard(page);
      await page.reload();
      await expect(doomed).toBeVisible({ timeout: 15_000 });
      await expect(keeper).toBeVisible();

      // ── Confirming removes it, and it stays removed ─────────────────
      await actions.click();
      await page.getByRole("menuitem", { name: "Remove" }).click();
      await ask.getByRole("button", { name: "Remove" }).click();
      await expect(ask).toBeHidden();
      await expect(doomed).toHaveCount(0);

      await saveDashboard(page);
      await page.reload();
      await expect(keeper).toBeVisible({ timeout: 15_000 });
      await expect(doomed).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  test("Delete page names the page and its widgets, Cancel keeps it, and an empty page goes without asking", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Delete page ${Date.now()}`,
    );
    try {
      await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [
              pageOf("p1", "Main", ["Overview"]),
              pageOf("p2", "Sales", ["Revenue", "Orders"]),
              pageOf("p3", "Blank", []),
            ],
          },
        },
      });
      await page.goto(`/${id}/edit`);

      const tab = (name: string) => page.getByRole("tab", { name });
      const options = (name: string) =>
        page.getByRole("button", { name: `Page options for ${name}` });
      const ask = page.getByRole("alertdialog", { name: 'Delete "Sales"?' });
      await expect(tab("Sales")).toBeVisible({ timeout: 15_000 });

      // ── A page with widgets asks, naming it and its widget count ────
      // The options button only shows on hover; force past the opacity.
      await options("Sales").click({ force: true });
      await page.getByRole("menuitem", { name: "Delete page" }).click();
      await expect(ask).toBeVisible();
      await expect(ask).toContainText("its 2 widgets");
      await ask.getByRole("button", { name: "Cancel" }).click();
      await expect(ask).toBeHidden();
      await expect(options("Sales")).toBeFocused();
      await expect(tab("Sales")).toBeVisible();

      // ── An empty page takes nothing with it: no question ────────────
      await options("Blank").click({ force: true });
      await page.getByRole("menuitem", { name: "Delete page" }).click();
      await expect(tab("Blank")).toHaveCount(0);
      await expect(page.getByRole("alertdialog")).toHaveCount(0);

      await saveDashboard(page);
      await page.reload();
      await expect(tab("Sales")).toBeVisible({ timeout: 15_000 });
      await expect(tab("Main")).toBeVisible();
      await expect(tab("Blank")).toHaveCount(0);

      // ── Confirming deletes it, and it stays deleted ─────────────────
      await options("Sales").click({ force: true });
      await page.getByRole("menuitem", { name: "Delete page" }).click();
      await ask.getByRole("button", { name: "Delete" }).click();
      await expect(ask).toBeHidden();
      await expect(tab("Sales")).toHaveCount(0);

      await saveDashboard(page);
      await page.reload();
      await expect(tab("Main")).toBeVisible({ timeout: 15_000 });
      await expect(tab("Sales")).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });
});
