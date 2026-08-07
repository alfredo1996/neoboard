import { test, expect, ALICE, createTestDashboard } from "./fixtures";

/**
 * #1395 — a table whose saved `groupBy` is an **array** rendered completely
 * flat: no group rows, no aggregates, no error. Individual rows then read as
 * group totals, which is a wrong answer the user has every reason to believe.
 *
 * The array is the shape that seeded layouts, imported dashboards and NeoDash
 * conversions carry; the widget editor writes a comma-separated string, which
 * always worked. So this test deliberately drives the **array** path — an
 * editor-driven test would exercise the working one and pass either way.
 */
test.describe("Table grouping from a saved layout (#1395)", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("a groupBy array from saved JSON renders group rows", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Table grouping ${Date.now()}`,
    );

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
                    id: "tbl",
                    chartType: "table",
                    // `released` repeats across rows, so grouping by it must
                    // collapse them into a handful of group rows.
                    query:
                      "MATCH (m:Movie) WHERE m.released IS NOT NULL RETURN m.released AS released, m.title AS title ORDER BY released LIMIT 20",
                    connectionId: "conn-neo4j-001",
                    settings: {
                      title: "Movies by year",
                      chartOptions: {
                        enableGrouping: true,
                        // The shape under test. Not a string.
                        groupBy: ["released"],
                        aggregationFn: "count",
                      },
                    },
                  },
                ],
                gridLayout: [{ i: "tbl", x: 0, y: 0, w: 12, h: 6 }],
              },
            ],
          },
        },
      });

      await page.goto(`/${id}`);
      await expect(page.locator("table").first()).toBeVisible({
        timeout: 20_000,
      });

      // Group rows carry an expand toggle; flat rows do not. Before the fix the
      // table rendered every row individually and this count was 0.
      await expect(
        page.getByRole("button", { name: "Toggle group" }).first(),
      ).toBeVisible({ timeout: 20_000 });

      const groups = await page
        .getByRole("button", { name: "Toggle group" })
        .count();
      expect(groups).toBeGreaterThan(0);

      // Grouping must actually collapse: fewer group rows than source rows.
      expect(groups).toBeLessThan(20);
    } finally {
      await cleanup();
    }
  });
});
