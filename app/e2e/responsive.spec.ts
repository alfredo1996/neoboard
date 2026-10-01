import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";

test.describe("Responsive — mobile viewport", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("dashboard list should render in single column on mobile", async ({
    page,
  }) => {
    await expect(
      page.getByText("Movie Analytics", { exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });
    // Verify grid renders single column at mobile width
    const grid = page.locator(".grid").first();
    await expect(grid).toBeVisible();
    const columns = await grid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns,
    );
    // Single column = one value (no spaces)
    expect(columns.trim().split(/\s+/).length).toBe(1);
  });
});

test.describe("Responsive — mobile login (unauthenticated)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("login page should render correctly on mobile", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("NeoBoard")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});

test.describe("Responsive — tablet viewport", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("dashboard list should render on tablet", async ({ page }) => {
    await expect(
      page.getByText("Movie Analytics", { exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });
    const grid = page.locator(".grid").first();
    await expect(grid).toBeVisible();
    const columns = await grid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns,
    );
    // Tablet (768px) hits sm breakpoint (640px) → 2 columns
    expect(columns.trim().split(/\s+/).length).toBe(2);
  });

  test("connections page should render on tablet", async ({
    sidebarPage,
    page,
  }) => {
    await sidebarPage.navigateTo("Connections");
    await expect(
      page.getByRole("heading", { level: 1, name: "Connections" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Add Connection" }),
    ).toBeVisible();
  });

  test("the dashboard chrome fits the tablet floor (#2056)", async ({
    page,
  }) => {
    const name = `Tablet floor dashboard with a long name ${uid()}`;
    const widgetTitle = "A widget title far too long for a narrow card";
    const picked = "Philip Seymour Hoffman";
    // A long placeholder, then a picked value on both triggers (the
    // searchable popover button and the plain select), where the clear
    // button takes room beside the trigger.
    const selects = [
      { param: "tablet_pick", searchable: true, picked: false },
      { param: "tablet_picked", searchable: true, picked: true },
      { param: "tablet_picked_plain", searchable: false, picked: true },
    ];
    const { id, cleanup } = await createTestDashboard(page.request, name);
    try {
      await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [
              {
                id: "p1",
                title: "Page 1",
                widgets: selects.map((s, i) => ({
                  id: s.param,
                  chartType: "parameter-select",
                  connectionId: "conn-neo4j-001",
                  query: "",
                  settings: {
                    title: i === 0 ? widgetTitle : s.param,
                    chartOptions: {
                      parameterName: s.param,
                      parameterType: "select",
                      searchable: s.searchable,
                      placeholder: "Pick a movie from the whole catalogue",
                      ...(s.picked && {
                        seedQuery: 'RETURN "Philip Seymour Hoffman" AS value',
                        defaultValue: picked,
                      }),
                    },
                  },
                })),
                // w:3 cards: about 85 px of row for each select at 768.
                gridLayout: selects.map((s, i) => ({
                  i: s.param,
                  x: i * 3,
                  y: 0,
                  w: 3,
                  h: 3,
                })),
              },
            ],
          },
        },
      });

      await page.goto("/");
      await expect(
        page.getByRole("button", { name: "Expand sidebar" }),
      ).toBeVisible();
      await expect(
        page.getByTestId("dashboard-card").getByTitle(name, { exact: true }),
      ).toBeVisible();

      await page.goto(`/${id}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveAttribute(
        "title",
        name,
      );
      await expect(page.getByTitle("Edit dashboard (Cmd+E)")).toBeInViewport({
        ratio: 1,
      });
      await expect(
        page.getByRole("heading", { name: widgetTitle }),
      ).toHaveAttribute("title", widgetTitle);
      // Soft: each select is its own case, so a failure names every one.
      for (const s of selects) {
        const combobox = page.getByRole("combobox", {
          name: s.param,
          exact: true,
        });
        // ratio 1: a select spilling out of its card is clipped by the card.
        await expect.soft(combobox).toBeInViewport({ ratio: 1 });
        // Its chevron stays full size and inside its border.
        const chevron = await combobox.evaluate((el) => {
          const icon = el
            .querySelector(":scope > svg")!
            .getBoundingClientRect();
          return {
            width: icon.width,
            inside: icon.right <= el.getBoundingClientRect().right,
          };
        });
        expect.soft(chevron, `${s.param} chevron`).toEqual({
          width: 16,
          inside: true,
        });
        if (!s.picked) continue;
        // The clear button wraps below rather than squeezing the trigger
        // into an empty box: the value keeps a character and its ellipsis.
        const value = combobox.getByText(picked);
        await expect.soft(value).toBeVisible();
        const width = (await value.boundingBox())?.width ?? 0;
        expect.soft(width, `${s.param} value width`).toBeGreaterThanOrEqual(16);
        await expect
          .soft(
            page.getByRole("button", {
              name: `Clear ${s.param}`,
              exact: true,
            }),
          )
          .toBeInViewport({ ratio: 1 });
      }
    } finally {
      await cleanup();
    }
  });
});

test.describe("Responsive — wide desktop viewport", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("dashboard list should render in three columns on wide desktop", async ({
    page,
  }) => {
    await expect(
      page.getByText("Movie Analytics", { exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });
    const grid = page.locator(".grid").first();
    await expect(grid).toBeVisible();
    const columns = await grid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns,
    );
    // Wide desktop (1920px) hits lg breakpoint (1024px) → 3 columns
    expect(columns.trim().split(/\s+/).length).toBe(3);
    // At desktop the sidebar starts expanded; only below lg is it a rail (#2056).
    await expect(
      page.getByRole("button", { name: "Collapse sidebar" }),
    ).toBeVisible();
  });
});
