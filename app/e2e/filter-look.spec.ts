import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  editingCrumb,
  saveDashboard,
  uid,
} from "./fixtures";

/**
 * #2368: a filter can be given its own field fill and border from preset
 * colour pairs. Set in the widget editor's Style tab, the saved filter's
 * trigger carries the chosen tokens in both themes, the popover keeps the
 * default look, and a relative-date filter (no field) has no Appearance.
 * Created per run and deleted by id.
 */
const widget = (id: string, parameterType: string) => ({
  id,
  chartType: "parameter-select",
  connectionId: "conn-neo4j-001",
  query: "",
  settings: {
    title: "Actor",
    chartOptions: {
      parameterType,
      parameterName: "actor",
      seedQuery: "MATCH (p:Person) RETURN p.name AS name ORDER BY name LIMIT 5",
    },
  },
});

async function seed(
  request: import("@playwright/test").APIRequestContext,
  dashboardId: string,
  parameterType: string,
) {
  const put = await request.put(`/api/dashboards/${dashboardId}`, {
    data: {
      layoutJson: {
        version: 2 as const,
        pages: [
          {
            id: "page-1",
            title: "Main",
            widgets: [widget("p-actor", parameterType)],
            gridLayout: [{ i: "p-actor", x: 0, y: 0, w: 4, h: 3 }],
          },
        ],
      },
    },
  });
  expect(put.ok()).toBe(true);
}

async function openStyleTab(page: import("@playwright/test").Page) {
  const card = page.locator("[data-widget-id='p-actor']");
  await card.hover();
  await card.getByRole("button", { name: "Widget actions" }).click();
  await page.getByRole("menuitem", { name: "Edit Widget" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Widget" });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole("tab", { name: "Style" }).click();
  return dialog;
}

test("a filter's fill and border follow the swatches, in both themes", async ({
  page,
  authPage,
}) => {
  test.setTimeout(120_000);
  await authPage.login(ALICE.email, ALICE.password);
  const { id, cleanup } = await createTestDashboard(
    page.request,
    `filter-look ${uid()}`,
  );
  try {
    await seed(page.request, id, "select");
    await page.goto(`/${id}/edit`);
    await expect(editingCrumb(page)).toBeVisible();

    let dialog = await openStyleTab(page);
    await dialog
      .getByRole("radiogroup", { name: "Field fill", exact: true })
      .getByRole("radio", { name: "Azure", exact: true })
      .click();
    await dialog
      .getByRole("radiogroup", { name: "Field border", exact: true })
      .getByRole("radio", { name: "Citrine", exact: true })
      .click();
    // The preview shows it at once.
    await expect(
      dialog.getByTestId("param-preview").locator("[data-field-fill='azure']"),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(dialog).toBeHidden();
    await saveDashboard(page);

    // Reopening shows both swatches checked.
    dialog = await openStyleTab(page);
    await expect(
      dialog
        .getByRole("radiogroup", { name: "Field fill", exact: true })
        .getByRole("radio", { name: "Azure", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      dialog
        .getByRole("radiogroup", { name: "Field border", exact: true })
        .getByRole("radio", { name: "Citrine", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    for (const theme of ["light", "dark"] as const) {
      await page.evaluate(
        (t) => localStorage.setItem("neoboard-theme", t),
        theme,
      );
      await page.goto(`/${id}`);
      const trigger = page.getByRole("combobox", {
        name: "Actor",
        exact: true,
      });
      await expect(trigger).toBeVisible({ timeout: 15_000 });
      await expect(page.locator("html")).toHaveClass(
        theme === "dark" ? /dark/ : /^((?!dark).)*$/,
      );
      const seen = await page.evaluate(() => {
        const probe = (prop: string, v: string) => {
          const el = document.createElement("div");
          el.style.border = "1px solid";
          el.style.background = `hsl(var(${v}))`;
          el.style.borderColor = `hsl(var(${v}))`;
          document.body.append(el);
          const cs = getComputedStyle(el);
          const out = prop === "bg" ? cs.backgroundColor : cs.borderTopColor;
          el.remove();
          return out;
        };
        const trig = document.querySelector('[aria-label="Actor"]')!;
        const cs = getComputedStyle(trig);
        return {
          bg: cs.backgroundColor,
          border: cs.borderTopColor,
          fill: probe("bg", "--param-fill-azure"),
          edge: probe("border", "--param-border-citrine"),
        };
      });
      expect(seen.bg).toBe(seen.fill);
      expect(seen.border).toBe(seen.edge);
    }

    // The popover is portalled: it keeps the default fill.
    await page.getByRole("combobox", { name: "Actor", exact: true }).click();
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    const tokens = await listbox.evaluate((el) => ({
      inPopover: getComputedStyle(el).getPropertyValue("--field").trim(),
      root: getComputedStyle(document.documentElement)
        .getPropertyValue("--field")
        .trim(),
    }));
    expect(tokens.inPopover).toBe(tokens.root);
  } finally {
    await cleanup();
  }
});

test("Appearance is offered for a select and hidden for a relative date", async ({
  page,
  authPage,
}) => {
  test.setTimeout(90_000);
  await authPage.login(ALICE.email, ALICE.password);
  const { id, cleanup } = await createTestDashboard(
    page.request,
    `filter-look-rel ${uid()}`,
  );
  try {
    await seed(page.request, id, "date-relative");
    await page.goto(`/${id}/edit`);
    await expect(editingCrumb(page)).toBeVisible();
    const dialog = await openStyleTab(page);
    await expect(
      dialog.getByRole("button", { name: "Behaviour", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("radiogroup", { name: "Field fill", exact: true }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "Appearance", exact: true }),
    ).toHaveCount(0);
  } finally {
    await cleanup();
  }
});
