import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  saveDashboard,
  uid,
} from "./fixtures";

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
      `Param defaults ${uid()}`,
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

  // #2158: the seed stops before 1999, so only the default's marker types it.
  test("a numeric default past its seed's LIMIT filters its widget", async ({
    page,
  }) => {
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Typed default ${uid()}`,
    );
    try {
      const put = await page.request.put(`/api/dashboards/${id}`, {
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
                      chartOptions: {
                        parameterType: "select",
                        parameterName: "year",
                        defaultValue: "n:1999",
                        seedQuery:
                          "MATCH (m:Movie) RETURN DISTINCT m.released ORDER BY m.released LIMIT 3",
                      },
                    },
                  },
                  {
                    id: "tbl",
                    chartType: "table",
                    connectionId: "conn-neo4j-001",
                    query:
                      "MATCH (m:Movie) WHERE m.released = $param_year RETURN m.title AS title",
                    settings: { title: "Movies" },
                  },
                ],
                gridLayout: [
                  { i: "sel", x: 0, y: 0, w: 4, h: 3 },
                  { i: "tbl", x: 4, y: 0, w: 8, h: 5 },
                ],
              },
            ],
          },
        },
      });
      expect(put.ok()).toBe(true);
      await page.goto(`/${id}`);
      await expect(page.getByRole("cell", { name: "The Matrix" })).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await cleanup();
    }
  });

  // #2158: the author types 1999; the option Test Seed Query loaded types it,
  // so the saved default is the number, which the test above applies.
  test("a default that matches a tested seed option is saved typed", async ({
    page,
  }) => {
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Saved default ${uid()}`,
    );
    try {
      await page.goto(`/${id}/edit`);
      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });
      await dialog.getByRole("combobox").nth(1).click();
      await page.getByRole("option", { name: "Parameter Selector" }).click();
      await dialog.getByRole("combobox").nth(0).click();
      await page.getByRole("option").first().click();
      await dialog.locator("#seed-query").fill("RETURN 1999 AS value");
      await dialog.getByLabel("Parameter Name").fill("year");
      await dialog.getByRole("button", { name: "Test Seed Query" }).click();
      await expect(
        dialog.getByText("1 option loaded — see preview"),
      ).toBeVisible({ timeout: 15_000 });
      await dialog.getByRole("tab", { name: "Style" }).click();
      await dialog.locator("#defaultValue").fill("1999");
      await dialog.getByRole("button", { name: "Add Widget" }).click();
      await expect(dialog).toBeHidden();
      await saveDashboard(page);

      const res = await page.request.get(`/api/dashboards/${id}`);
      const body = (await res.json()) as {
        data: {
          layoutJson: {
            pages: Array<{
              widgets: Array<{
                settings?: { chartOptions?: Record<string, unknown> };
              }>;
            }>;
          };
        };
      };
      expect(
        body.data.layoutJson.pages[0].widgets[0].settings?.chartOptions
          ?.defaultValue,
      ).toBe("n:1999");
    } finally {
      await cleanup();
    }
  });
});
