import { test, expect, ALICE, createTestDashboard } from "./fixtures";

/**
 * #1421 — a parameter widget's **Default value** was never applied, because
 * `extractParamDefaults` had zero production callers. Every dashboard relying
 * on defaults rendered empty on arrival: the seeded Chart Playground (8 pages,
 * 21 configured defaults) showed "Waiting for parameters…" on every chart until
 * the user set each knob by hand.
 *
 * Built as a fixture rather than driving the seeded Playground, which is a demo
 * showcase and is not present in the E2E database.
 */
test.describe("Parameter defaults are applied on load (#1421)", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("a configured default renders the chart instead of 'Waiting for parameters'", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Param defaults ${Date.now()}`,
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
                    id: "sel",
                    chartType: "parameter-select",
                    connectionId: "conn-neo4j-001",
                    query: "",
                    settings: {
                      title: "Title filter",
                      chartOptions: {
                        parameterName: "title_filter",
                        parameterType: "text",
                        defaultValue: "The",
                      },
                    },
                  },
                  {
                    // Consumes the parameter. Neo4j binds `$param_` natively,
                    // so this is a real bound parameter, not string splicing.
                    id: "tbl",
                    chartType: "table",
                    connectionId: "conn-neo4j-001",
                    query:
                      "MATCH (m:Movie) WHERE m.title CONTAINS $param_title_filter RETURN m.title AS title LIMIT 3",
                    settings: { title: "Filtered movies" },
                  },
                ],
                gridLayout: [
                  { i: "sel", x: 0, y: 0, w: 4, h: 3 },
                  { i: "tbl", x: 4, y: 0, w: 8, h: 4 },
                ],
              },
            ],
          },
        },
      });

      await page.goto(`/${id}`);

      // The symptom: the consuming widget stalls, naming the token it lacks.
      await expect(page.getByText(/Waiting for parameters/)).toHaveCount(0, {
        timeout: 20_000,
      });
      await expect(page.getByText("$param_title_filter")).toHaveCount(0);

      // And the chart actually renders, which only happens once the parameter
      // resolves and the query runs.
      await expect(page.locator("table").first()).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await cleanup();
    }
  });
});
