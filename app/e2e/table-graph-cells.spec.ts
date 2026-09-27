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
                      "RETURN m, r, p, nodes(p) AS ns ORDER BY a.name LIMIT 1",
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
      const list = cells.nth(3);

      await expect(node).toContainText(":Movie {", { timeout: 20_000 });
      await expect(node).toContainText('title: "Cloud Atlas"');
      await expect(node).toContainText("released: 2012");
      await expect(relationship).toContainText("[:ACTED_IN {roles: [");
      await expect(path).toContainText(")-[:ACTED_IN {roles: [");
      // Property order is the database's, so each piece is asserted alone.
      await expect(path).toContainText("]}]->(:Movie {");
      await expect(path).toContainText('title: "Cloud Atlas"');
      // Inside a list, a node reads as it does in a path.
      await expect(list).toContainText("[(:Person {");
      await expect(list).toContainText("}),(:Movie {");

      for (const cell of [node, relationship, path, list]) {
        await expect(cell).not.toContainText("$type");
        await expect(cell).not.toContainText("elementId");
      }
    } finally {
      await cleanup();
    }
  });

  test("a node column groups and filters by the text its cells show", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Table graph grouping ${Date.now()}`,
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
                      "MATCH (m:Movie) WHERE m.title IN ['Cloud Atlas', 'The Matrix'] " +
                      "RETURN m ORDER BY m.title",
                    settings: {
                      title: "Graph grouping",
                      chartOptions: {
                        enablePagination: false,
                        enableGrouping: true,
                        groupBy: "m",
                        enableColumnFilters: true,
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
      expect(putRes.ok()).toBe(true);

      await page.goto(`/${id}`);
      const widget = page.getByTestId("widget-card");
      const groups = widget.getByRole("button", { name: "Toggle group" });

      // Before: both nodes keyed "[object Object]", one group headed
      // "Cloud Atlas (2)".
      await expect(groups).toHaveCount(2, { timeout: 20_000 });
      await expect(groups.nth(0)).toContainText('title: "Cloud Atlas"');
      await expect(groups.nth(1)).toContainText('title: "The Matrix"');

      // Before: the filter searched "[object Object]" and matched nothing.
      await widget.getByLabel("Filter m").fill("matrix");
      await expect(groups).toHaveCount(1);
      await expect(groups.first()).toContainText('title: "The Matrix"');
    } finally {
      await cleanup();
    }
  });
});
