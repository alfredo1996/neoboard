import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";

// The dashboard header's Filters button, its capped list, and the one-line
// strip of active filters (#2297).

const SET = 11;

async function seed(
  request: import("@playwright/test").APIRequestContext,
  filters: number,
  set: number,
) {
  const { id, cleanup } = await createTestDashboard(
    request,
    `Header filters ${uid()}`,
  );
  const widgets = Array.from({ length: filters }, (_, i) => ({
    id: `w${i}`,
    chartType: "parameter-select",
    connectionId: "",
    query: "",
    settings: {
      title: `Filter ${i + 1}`,
      chartOptions: {
        parameterName: `f${i + 1}`,
        parameterType: "text",
        ...(i < set ? { defaultValue: `value ${i + 1}` } : {}),
      },
    },
  }));
  const res = await request.put(`/api/dashboards/${id}`, {
    data: {
      layoutJson: {
        version: 2,
        pages: [
          {
            id: "p0",
            title: "Page 1",
            widgets,
            gridLayout: widgets.map((w, i) => ({
              i: w.id,
              x: (i % 4) * 3,
              y: Math.floor(i / 4) * 2,
              w: 3,
              h: 2,
            })),
          },
        ],
      },
    },
  });
  expect(res.ok()).toBe(true);
  return { id, cleanup };
}

const strip = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "Active filters" });

test("the header lists every filter, clears one and jumps to a selector", async ({
  authPage,
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 1024 });
  await authPage.login(ALICE.email, ALICE.password);
  const { id, cleanup } = await seed(page.request, SET + 1, SET);
  try {
    await page.goto(`/${id}`);
    const button = page.getByRole("button", { name: /^Filters/ });
    await expect(button).toBeVisible({ timeout: 15_000 });
    await expect(button.getByLabel(`${SET} set`)).toBeVisible();

    await button.click();
    const list = page.getByRole("dialog", { name: "Filters" });
    // 12 filters is over the search threshold, and the unset one reads Any.
    await expect(
      list.getByRole("searchbox", { name: "Find a filter" }),
    ).toBeVisible();
    const rows = list.getByRole("listitem");
    await expect(rows).toHaveCount(SET + 1);
    await expect(rows.last()).toContainText("Filter 12");
    await expect(rows.last()).toContainText("Any");

    // Clear one: the count drops and that row reads Any.
    await list
      .getByRole("button", { name: "Clear Filter 1", exact: true })
      .click();
    await expect(button.getByLabel(`${SET - 1} set`)).toBeVisible();
    await expect(
      rows.filter({
        has: page.getByRole("button", {
          name: "Go to Filter 1 selector",
          exact: true,
        }),
      }),
    ).toContainText("Any");

    // Jump: the list closes and the selector's card is highlighted.
    await list
      .getByRole("button", {
        name: "Go to Filter 5 selector",
        exact: true,
      })
      .click();
    await expect(list).toBeHidden();
    await expect(page.locator('[data-widget-id="w4"]')).toHaveClass(
      /widget-highlight/,
    );
  } finally {
    await cleanup();
  }
});

test("the strip stays one 44px line with 11 filters set, and scrolls", async ({
  authPage,
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 1024 });
  await authPage.login(ALICE.email, ALICE.password);
  const { id, cleanup } = await seed(page.request, SET, SET);
  try {
    await page.goto(`/${id}`);
    await expect(strip(page)).toBeVisible({ timeout: 15_000 });
    const box = await strip(page).boundingBox();
    expect(box!.height).toBe(44);
    await expect(strip(page).getByLabel("More filters")).toBeVisible();
    await expect(strip(page).getByLabel("Earlier filters")).toHaveCount(0);

    await strip(page).getByLabel("More filters").click();
    await expect(strip(page).getByLabel("Earlier filters")).toBeVisible();

    await strip(page).getByRole("button", { name: "Clear all" }).click();
    await expect(strip(page)).toHaveCount(0);
    // The button stays: every filter is still listed, now as Any.
    await expect(page.getByRole("button", { name: /^Filters/ })).toBeVisible();
  } finally {
    await cleanup();
  }
});

test("a dashboard with no filters has no Filters button", async ({
  authPage,
  page,
}) => {
  await authPage.login(ALICE.email, ALICE.password);
  const { id, cleanup } = await seed(page.request, 0, 0);
  try {
    await page.goto(`/${id}`);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /^Filters/ })).toHaveCount(0);
  } finally {
    await cleanup();
  }
});

test("the filter bar can be hidden from the Filters menu, and stays hidden", async ({
  authPage,
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 1024 });
  await authPage.login(ALICE.email, ALICE.password);
  const { id, cleanup } = await seed(page.request, 3, 3);
  try {
    await page.goto(`/${id}`);
    const button = page.getByRole("button", { name: /^Filters/ });
    await expect(strip(page)).toBeVisible({ timeout: 15_000 });

    await button.click();
    const sw = page
      .getByRole("dialog", { name: "Filters", exact: true })
      .getByRole("switch", { name: "Show filter bar", exact: true });
    await expect(sw).toBeChecked();
    await sw.click();
    await expect(strip(page)).toHaveCount(0);
    await expect(button.getByLabel("3 set")).toBeVisible();

    await page.reload();
    await expect(button.getByLabel("3 set")).toBeVisible({ timeout: 15_000 });
    await expect(strip(page)).toHaveCount(0);

    await button.click();
    await page
      .getByRole("dialog", { name: "Filters", exact: true })
      .getByRole("switch", { name: "Show filter bar", exact: true })
      .click();
    await expect(strip(page)).toBeVisible();
  } finally {
    await cleanup();
  }
});
