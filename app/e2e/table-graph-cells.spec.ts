import { test, expect, ALICE, createTestDashboard } from "./fixtures";

/**
 * #2050 — a Data Table filled a graph cell with the raw canonical shape:
 * `{"$type":"node","elementId":"4:…","labels":["Movie"],"properties":{…}}`.
 * A node now reads `:Movie {title: "Cloud Atlas", …}`, a relationship
 * `[:ACTED_IN {…}]`, a path its chain. Driven against the seeded movie graph,
 * because the shapes are whatever the connector really emits.
 */
test.describe("Table widget — graph cells (#2050)", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("a node, a relationship and a path read as labels, type and properties", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Table graph cells ${Date.now()}`,
    );

    try {
      const putRes = await page.request.put(`/api/dashboards/${id}`, {
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
                    connectionId: "conn-neo4j-001",
                    query:
                      "MATCH p = (a:Person)-[r:ACTED_IN]->(m:Movie {title: 'Cloud Atlas'}) " +
                      "RETURN m, r, p ORDER BY a.name LIMIT 1",
                    settings: {
                      title: "Graph cells",
                      chartOptions: { enablePagination: false },
                    },
                  },
                ],
                gridLayout: [{ i: "tbl", x: 0, y: 0, w: 12, h: 6 }],
              },
            ],
          },
        },
      });
      expect(putRes.ok()).toBe(true);

      await page.goto(`/${id}`);
      const cells = page.getByTestId("widget-card").getByRole("cell");
      const node = cells.nth(0);
      const relationship = cells.nth(1);
      const path = cells.nth(2);

      await expect(node).toContainText(":Movie {", { timeout: 20_000 });
      await expect(node).toContainText('title: "Cloud Atlas"');
      await expect(node).toContainText("released: 2012");
      await expect(relationship).toContainText("[:ACTED_IN {roles: [");
      await expect(path).toContainText(")-[:ACTED_IN {roles: [");
      // Property order is the database's, so each piece is asserted alone.
      await expect(path).toContainText("]}]->(:Movie {");
      await expect(path).toContainText('title: "Cloud Atlas"');

      for (const cell of [node, relationship, path]) {
        await expect(cell).not.toContainText("$type");
        await expect(cell).not.toContainText("elementId");
      }
    } finally {
      await cleanup();
    }
  });
});
