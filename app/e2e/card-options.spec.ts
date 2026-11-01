import type { APIRequestContext, Locator, Page } from "@playwright/test";
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
 * #2394: any card can have a description (an info icon after the title), and a
 * markdown, single value, table, JSON, filter or form card can change its
 * background. Set in the widget editor's Style tab, saved, reloaded. A chart's
 * Style has the Description and no Background. Created per run, deleted by id.
 */
const DESCRIPTION = "Gross, in dollars";

const widgets = [
  {
    id: "w-md",
    chartType: "markdown",
    connectionId: "",
    query: "",
    settings: { title: "Heading", chartOptions: { content: "# Hello" } },
  },
  {
    id: "w-tbl",
    chartType: "table",
    connectionId: "conn-neo4j-001",
    query: "RETURN 1 AS n",
    settings: { title: "Numbers", chartOptions: {} },
  },
  {
    id: "w-bar",
    chartType: "bar",
    connectionId: "conn-neo4j-001",
    query: "RETURN 'a' AS k, 1 AS v",
    settings: { title: "Chart", chartOptions: {} },
  },
];

async function seed(request: APIRequestContext, dashboardId: string) {
  const put = await request.put(`/api/dashboards/${dashboardId}`, {
    data: {
      layoutJson: {
        version: 2 as const,
        pages: [
          {
            id: "page-1",
            title: "Main",
            widgets,
            gridLayout: widgets.map((w, i) => ({
              i: w.id,
              x: (i % 3) * 4,
              y: 0,
              w: 4,
              h: 4,
            })),
          },
        ],
      },
    },
  });
  expect(put.ok()).toBe(true);
}

async function openStyle(page: Page, widgetId: string) {
  const card = page.locator(`[data-widget-id='${widgetId}']`);
  await card.hover();
  await card
    .getByRole("button", { name: "Widget actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Edit Widget", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit Widget", exact: true });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole("tab", { name: "Style", exact: true }).click();
  return dialog;
}

async function setCard(
  page: Page,
  widgetId: string,
  background: string,
  description: string,
) {
  const dialog = await openStyle(page, widgetId);
  await dialog
    .getByRole("radiogroup", { name: "Background", exact: true })
    .getByRole("radio", { name: background, exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Description", exact: true })
    .fill(description);
  // The preview shows both at once.
  await expect(
    dialog
      .getByTestId("widget-preview")
      .locator("xpath=ancestor::*[@data-card-fill][1]"),
  ).toHaveAttribute("data-card-fill", background.toLowerCase());
  await dialog
    .getByRole("button", { name: "Save Changes", exact: true })
    .click();
  await expect(dialog).toBeHidden();
}

/** The colour a token paints, read through a probe in the page. */
function paintOf(page: Page, token: string) {
  return page.evaluate((t) => {
    const el = document.createElement("div");
    el.style.background = `hsl(var(${t}))`;
    document.body.append(el);
    const out = getComputedStyle(el).backgroundColor;
    el.remove();
    return out;
  }, token);
}

const cardOf = (page: Page, widgetId: string) =>
  page.locator(`[data-widget-id='${widgetId}'] [data-card-fill]`);

const infoOf = (page: Page, widgetId: string) =>
  page
    .locator(`[data-widget-id='${widgetId}']`)
    .getByRole("button", { name: /^About this card/ });

async function textIsShown(page: Page, shown: boolean) {
  // The popover only: a screen-reader copy of the text is always in the icon.
  const text = page
    .locator("[data-radix-popper-content-wrapper]")
    .getByText(DESCRIPTION, { exact: true });
  if (shown) await expect(text).toBeVisible();
  else await expect(text).toHaveCount(0);
}

async function setTheme(page: Page, id: string, theme: "light" | "dark") {
  await page.evaluate((t) => localStorage.setItem("neoboard-theme", t), theme);
  await page.goto(`/${id}`);
  await expect(page.locator("html")).toHaveClass(
    theme === "dark" ? /dark/ : /^((?!dark).)*$/,
  );
}

test("a markdown card and a table take a background and a description, which survive a reload", async ({
  page,
  authPage,
}) => {
  test.setTimeout(180_000);
  await authPage.login(ALICE.email, ALICE.password);
  const { id, cleanup } = await createTestDashboard(
    page.request,
    `card-options ${uid()}`,
  );
  try {
    await seed(page.request, id);
    await page.goto(`/${id}/edit`);
    await expect(editingCrumb(page)).toBeVisible();

    await setCard(page, "w-md", "Rose", DESCRIPTION);
    await setCard(page, "w-tbl", "None", DESCRIPTION);
    await saveDashboard(page);

    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, id, theme);
      await expect(cardOf(page, "w-md")).toBeVisible({ timeout: 15_000 });
      await expect(cardOf(page, "w-md")).toHaveAttribute(
        "data-card-fill",
        "rose",
      );
      await expect(cardOf(page, "w-md")).toHaveCSS(
        "background-color",
        await paintOf(page, "--card-fill-rose"),
      );
      await expect(cardOf(page, "w-tbl")).toHaveCSS(
        "background-color",
        await paintOf(page, "--page-ground"),
      );
      // None drops the shadow and paints the edge as the ground.
      await expect(cardOf(page, "w-tbl")).toHaveCSS("box-shadow", "none");
      await expect(cardOf(page, "w-tbl")).toHaveCSS(
        "border-top-color",
        await paintOf(page, "--page-ground"),
      );
    }

    // A chart is untouched, and a default card has no marker.
    await expect(
      page.locator("[data-widget-id='w-bar'] [data-card-fill]"),
    ).toHaveCount(0);

    // Hover and keyboard focus each open the text and close it again.
    const icon = infoOf(page, "w-md");
    await icon.hover();
    await textIsShown(page, true);
    await page.mouse.move(0, 0);
    await textIsShown(page, false);
    await icon.focus();
    await textIsShown(page, true);
    await icon.blur();
    await textIsShown(page, false);
  } finally {
    await cleanup();
  }
});

test("a chart's Style has the Description and no Background", async ({
  page,
  authPage,
}) => {
  test.setTimeout(90_000);
  await authPage.login(ALICE.email, ALICE.password);
  const { id, cleanup } = await createTestDashboard(
    page.request,
    `card-options-chart ${uid()}`,
  );
  try {
    await seed(page.request, id);
    await page.goto(`/${id}/edit`);
    await expect(editingCrumb(page)).toBeVisible();
    const dialog = await openStyle(page, "w-bar");
    await expect(
      dialog.getByRole("textbox", { name: "Description", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("radiogroup", { name: "Background", exact: true }),
    ).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("a long title leaves the info icon clear of the hover bar, so hovering it opens the text", async ({
  page,
  authPage,
}) => {
  test.setTimeout(90_000);
  await authPage.login(ALICE.email, ALICE.password);
  const { id, cleanup } = await createTestDashboard(
    page.request,
    `card-options-long ${uid()}`,
  );
  try {
    const long = {
      ...widgets[0],
      settings: {
        ...widgets[0].settings,
        title: "A very long title that cannot fit on one line of a narrow card",
        description: DESCRIPTION,
      },
    };
    const put = await page.request.put(`/api/dashboards/${id}`, {
      data: {
        layoutJson: {
          version: 2 as const,
          pages: [
            {
              id: "page-1",
              title: "Main",
              widgets: [long],
              gridLayout: [{ i: "w-md", x: 0, y: 0, w: 3, h: 4 }],
            },
          ],
        },
      },
    });
    expect(put.ok()).toBe(true);
    await page.goto(`/${id}`);
    const icon = infoOf(page, "w-md");
    await expect(icon).toBeVisible({ timeout: 15_000 });
    // The pointer is on the card, so the bar is showing; the icon is not under it.
    await page.locator("[data-widget-id='w-md']").hover();
    const bar = page.getByRole("button", { name: "Fullscreen", exact: true });
    await expect(bar).toBeVisible();
    const [i, b] = [await icon.boundingBox(), await bar.boundingBox()];
    expect(i!.x + i!.width).toBeLessThanOrEqual(b!.x);
    await icon.hover();
    await textIsShown(page, true);
  } finally {
    await cleanup();
  }
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true });

  test("a tap on the info icon opens the text", async ({ page, authPage }) => {
    test.setTimeout(90_000);
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `card-options-tap ${uid()}`,
    );
    try {
      const withText = widgets.map((w) => ({
        ...w,
        settings: { ...w.settings, description: DESCRIPTION },
      }));
      const put = await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2 as const,
            pages: [
              {
                id: "page-1",
                title: "Main",
                widgets: withText.slice(0, 1),
                gridLayout: [{ i: "w-md", x: 0, y: 0, w: 4, h: 4 }],
              },
            ],
          },
        },
      });
      expect(put.ok()).toBe(true);
      await page.goto(`/${id}`);
      const icon: Locator = infoOf(page, "w-md");
      await expect(icon).toBeVisible({ timeout: 15_000 });
      await textIsShown(page, false);
      await icon.tap();
      await textIsShown(page, true);
    } finally {
      await cleanup();
    }
  });
});
