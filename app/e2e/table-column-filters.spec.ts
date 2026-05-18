import { test, expect, ALICE, createTestDashboard } from "./fixtures";
import type { APIRequestContext } from "@playwright/test";

/**
 * Covers issue #854 — per-column filters in the Table widget never rendered
 * because no UI was bound to `column.setFilterValue`. The fix adds a second
 * header row with a small <Input> per filterable column when
 * `chartOptions.enableColumnFilters` is true.
 *
 * Three tests:
 *   1. Filters off (default) — no filter inputs are rendered.
 *   2. Filters on            — typing in a column filter narrows visible rows.
 *   3. Clearing a filter     — restores the original row set.
 */

const PG_CONNECTION_ID = "conn-pg-001";

/**
 * Helper: create a dashboard whose only widget is a 3-row table the test can
 * filter against. Three distinct cities so a "contains" filter has bite.
 */
async function createFilterableTableDashboard(
  request: APIRequestContext,
  name: string,
  enableColumnFilters: boolean,
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
                settings: {
                  title: name,
                  chartOptions: { enableColumnFilters },
                },
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

test.describe("Table widget — per-column filters (#854)", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("does NOT render the filter row when enableColumnFilters is false", async ({
    page,
  }) => {
    const { id, cleanup } = await createFilterableTableDashboard(
      page.request,
      "cf-off",
      false,
    );
    try {
      await page.goto(`/${id}`);
      // Wait for the data row to confirm the table actually rendered.
      await expect(page.getByText("Alice")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("data-grid-filter-row")).toHaveCount(0);
      await expect(page.getByLabel("Filter name")).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  test("renders filter inputs and narrows rows as the user types", async ({
    page,
  }) => {
    const { id, cleanup } = await createFilterableTableDashboard(
      page.request,
      "cf-on",
      true,
    );
    try {
      await page.goto(`/${id}`);
      await expect(page.getByText("Alice")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Bob")).toBeVisible();
      await expect(page.getByText("Charlie")).toBeVisible();

      // Filter row + per-column inputs are present.
      await expect(page.getByTestId("data-grid-filter-row")).toBeVisible();
      const nameFilter = page.getByLabel("Filter name");
      await expect(nameFilter).toBeVisible();

      await nameFilter.fill("ali");
      // Only Alice survives a case-insensitive contains on "ali".
      await expect(page.getByText("Alice")).toBeVisible();
      await expect(page.getByText("Bob")).toHaveCount(0);
      await expect(page.getByText("Charlie")).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  test("clearing a filter restores all rows", async ({ page }) => {
    const { id, cleanup } = await createFilterableTableDashboard(
      page.request,
      "cf-clear",
      true,
    );
    try {
      await page.goto(`/${id}`);
      await expect(page.getByText("Alice")).toBeVisible({ timeout: 10_000 });

      const cityFilter = page.getByLabel("Filter city");
      await cityFilter.fill("paris");
      await expect(page.getByText("Bob")).toHaveCount(0);
      await expect(page.getByText("Charlie")).toHaveCount(0);

      await cityFilter.fill("");
      await expect(page.getByText("Alice")).toBeVisible();
      await expect(page.getByText("Bob")).toBeVisible();
      await expect(page.getByText("Charlie")).toBeVisible();
    } finally {
      await cleanup();
    }
  });
});
