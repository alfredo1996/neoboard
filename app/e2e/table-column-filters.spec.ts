import { test, expect, ALICE, createTestDashboard } from "./fixtures";
import type { APIRequestContext } from "@playwright/test";

/**
 * Per-column filters live in each column's header menu (#854, #2222): the
 * column name is the menu button, and it holds a "Contains…" field. There is
 * no filter row and no `enableColumnFilters` option; a dashboard that saved
 * the option ignores it. An optional search box ("Search 3 rows",
 * `enableGlobalFilter`) searches every visible column.
 */

const PG_CONNECTION_ID = "conn-pg-001";

/**
 * A dashboard whose only widget is a 3-row table the test can filter against.
 * Three distinct cities so a "contains" filter has bite.
 */
async function createFilterableTableDashboard(
  request: APIRequestContext,
  name: string,
  chartOptions: Record<string, unknown> = {},
) {
  const { id, cleanup } = await createTestDashboard(request, name);
  const putRes = await request.put(`/api/dashboards/${id}`, {
    data: {
      layoutJson: {
        version: 2 as const,
        pages: [
          {
            id: "page-1",
            title: "Main",
            widgets: [
              {
                id: "w1",
                chartType: "table",
                connectionId: PG_CONNECTION_ID,
                // Three deterministic rows, distinct cities — independent of
                // any seeded fixture so the assertions are stable.
                query:
                  "SELECT 'Alice' AS name, 'Paris' AS city UNION ALL " +
                  "SELECT 'Bob', 'Berlin' UNION ALL " +
                  "SELECT 'Charlie', 'Madrid' ORDER BY name",
                settings: { title: name, chartOptions },
              },
            ],
            gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 8 }],
          },
        ],
      },
    },
  });
  if (!putRes.ok()) {
    throw new Error(`PUT dashboard failed: ${putRes.status()}`);
  }
  return { id, cleanup };
}

test.describe("Table widget — header menu filters (#854, #2222)", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("narrows rows as the user types in the column's menu, and shows it in the footer", async ({
    page,
  }) => {
    const { id, cleanup } = await createFilterableTableDashboard(
      page.request,
      "cf-menu",
    );
    try {
      await page.goto(`/${id}`);
      // Scope assertions to the widget card — "Alice" also appears in the
      // sidebar account menu ("Alice Demo") and "updated by Alice".
      const widget = page.getByTestId("widget-card");
      await expect(widget.getByText("Alice")).toBeVisible({ timeout: 10_000 });
      await expect(widget.getByText("Bob")).toBeVisible();
      await expect(widget.getByText("Charlie")).toBeVisible();
      await expect(widget.getByTestId("data-grid-filter-row")).toHaveCount(0);

      await widget.getByRole("button", { name: "name", exact: true }).click();
      await page.getByLabel("Filter name").pressSequentially("ali");
      // Only Alice survives a case-insensitive contains on "ali".
      await expect(widget.getByText("Alice")).toBeVisible();
      await expect(widget.getByText("Bob")).toHaveCount(0);
      await expect(widget.getByText("Charlie")).toHaveCount(0);
      await expect(widget.getByText("1–1 of 1, filtered from 3")).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test("Clear filters in the footer restores all rows", async ({ page }) => {
    const { id, cleanup } = await createFilterableTableDashboard(
      page.request,
      "cf-clear",
    );
    try {
      await page.goto(`/${id}`);
      const widget = page.getByTestId("widget-card");
      await expect(widget.getByText("Alice")).toBeVisible({ timeout: 10_000 });

      await widget.getByRole("button", { name: "city", exact: true }).click();
      await page.getByLabel("Filter city").fill("paris");
      await expect(widget.getByText("Bob")).toHaveCount(0);
      await expect(widget.getByText("Charlie")).toHaveCount(0);

      await page.keyboard.press("Escape");
      await widget.getByRole("button", { name: "Clear filters" }).click();
      await expect(widget.getByText("Alice")).toBeVisible();
      await expect(widget.getByText("Bob")).toBeVisible();
      await expect(widget.getByText("Charlie")).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test("Hide column drops it, and Show all in the footer brings it back", async ({
    page,
  }) => {
    const { id, cleanup } = await createFilterableTableDashboard(
      page.request,
      "cf-hide",
    );
    try {
      await page.goto(`/${id}`);
      const widget = page.getByTestId("widget-card");
      await expect(widget.getByText("Paris")).toBeVisible({ timeout: 10_000 });

      await widget.getByRole("button", { name: "city", exact: true }).click();
      await page.getByRole("menuitem", { name: "Hide column" }).click();
      await expect(widget.getByText("Paris")).toHaveCount(0);
      await expect(widget.getByText(/1 column hidden/)).toBeVisible();

      await widget.getByRole("button", { name: "Show all" }).click();
      await expect(widget.getByText("Paris")).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test("the search box searches every column, and is off by default", async ({
    page,
  }) => {
    type Made = Awaited<ReturnType<typeof createFilterableTableDashboard>>;
    let off: Made | undefined;
    let on: Made | undefined;
    try {
      off = await createFilterableTableDashboard(page.request, "cf-s-off");
      on = await createFilterableTableDashboard(page.request, "cf-s-on", {
        enableGlobalFilter: true,
      });
      await page.goto(`/${off.id}`);
      const widget = page.getByTestId("widget-card");
      await expect(widget.getByText("Alice")).toBeVisible({ timeout: 10_000 });
      await expect(widget.getByLabel("Search table")).toHaveCount(0);

      await page.goto(`/${on.id}`);
      await expect(widget.getByText("Alice")).toBeVisible({ timeout: 10_000 });
      // "Berlin" is in the city column, the row is Bob's.
      await widget.getByPlaceholder("Search 3 rows").fill("berlin");
      await expect(widget.getByText("Bob")).toBeVisible();
      await expect(widget.getByText("Alice")).toHaveCount(0);
    } finally {
      await off?.cleanup();
      await on?.cleanup();
    }
  });
});
