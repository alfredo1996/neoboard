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
                widgets: [
                  {
                    id: "sel",
                    chartType: "parameter-select",
                    connectionId: "conn-neo4j-001",
                    query: "",
                    settings: {
                      title: widgetTitle,
                      chartOptions: {
                        parameterName: "tablet_pick",
                        parameterType: "select",
                        placeholder: "Pick a movie from the whole catalogue",
                      },
                    },
                  },
                ],
                gridLayout: [{ i: "sel", x: 0, y: 0, w: 3, h: 3 }],
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
      // ratio 1: a select spilling out of its card is clipped by the card.
      await expect(
        page.getByRole("combobox", { name: "tablet_pick" }),
      ).toBeInViewport({ ratio: 1 });
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
