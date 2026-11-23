import { test, expect, ALICE, createTestDashboard } from "./fixtures";

/**
 * #2526: a click on a graph node carried only its id, so a click action
 * could never set a parameter from a node property. It now carries the
 * node's properties and "Value from" names one of them.
 */
test.describe("Graph click action (#2526)", () => {
  test.describe.configure({ timeout: 90_000 });

  test("a node click sets the parameter to the node's property and filters a second widget", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id } = await createTestDashboard(page.request, "graph-click-2526");
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
                    id: "w-graph",
                    chartType: "graph",
                    connectionId: "conn-neo4j-001",
                    query: "MATCH (m:Movie {title: 'Apollo 13'}) RETURN m",
                    settings: {
                      title: "One movie",
                      clickAction: {
                        type: "set-parameter",
                        parameterMapping: {
                          parameterName: "clicked_movie",
                          sourceField: "title",
                        },
                      },
                    },
                  },
                  {
                    id: "w-cast",
                    chartType: "table",
                    connectionId: "conn-neo4j-001",
                    query:
                      "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WHERE m.title = $param_clicked_movie RETURN p.name AS name ORDER BY name",
                    settings: { title: "Cast" },
                  },
                ],
                gridLayout: [
                  { i: "w-graph", x: 0, y: 0, w: 6, h: 8 },
                  { i: "w-cast", x: 6, y: 0, w: 6, h: 8 },
                ],
              },
            ],
          },
        },
      });
      expect(put.ok()).toBeTruthy();

      await page.goto(`/${id}`);
      const canvas = page
        .getByTestId("graph-exploration")
        .locator("canvas")
        .first();
      const cast = page.getByRole("cell", { name: "Kevin Bacon", exact: true });
      // NVL may not have laid the node out yet: click the centre until the
      // cast of the clicked movie appears.
      await expect(async () => {
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();
        await canvas.click({
          position: { x: box!.width / 2, y: box!.height / 2 },
          force: true,
        });
        await expect(cast).toBeVisible({ timeout: 1_500 });
      }).toPass({ timeout: 30_000 });
    } finally {
      await page.request.delete(`/api/dashboards/${id}`);
    }
  });
});
