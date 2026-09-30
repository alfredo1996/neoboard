import type { Page } from "@playwright/test";
import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";

/**
 * #2050 — a Data Table filled a graph cell with the raw canonical shape:
 * `{"$type":"node","elementId":"4:…","labels":["Movie"],"properties":{…}}`.
 * A node now reads `:Movie {title: "Cloud Atlas", …}`, a relationship
 * `[:ACTED_IN {…}]`, a path its chain. Driven against the seeded movie graph,
 * because the shapes are whatever the connector really emits.
 *
 * #2070 — an object column filtered and sorted on the raw value, so a title
 * typed into its filter matched nothing. It now filters on the cell's text.
 */

/** A dashboard with one table widget on the seeded movie graph. */
async function tableDashboard(
  page: Page,
  query: string,
  chartOptions: Record<string, unknown>,
) {
  const dashboard = await createTestDashboard(
    page.request,
    `Table graph cells ${uid()}`,
  );
  const putRes = await page.request.put(`/api/dashboards/${dashboard.id}`, {
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
                query,
                settings: {
                  title: "Graph cells",
                  chartOptions: { enablePagination: false, ...chartOptions },
                },
              },
            ],
            gridLayout: [{ i: "tbl", x: 0, y: 0, w: 12, h: 6 }],
          },
        ],
      },
    },
  });
  if (!putRes.ok()) await dashboard.cleanup();
  expect(putRes.ok()).toBe(true);
  return dashboard;
}

test.describe("Table widget — graph cells (#2050, #2070)", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("a node, a relationship and a path read as labels, type and properties", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const { id, cleanup } = await tableDashboard(
      page,
      "MATCH p = (a:Person)-[r:ACTED_IN]->(m:Movie {title: 'Cloud Atlas'}) " +
        "RETURN m, r, p, nodes(p) AS ns ORDER BY a.name LIMIT 1",
      {},
    );

    try {
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
      // Inside a list, each node reads as it does in its own cell.
      await expect(list).toContainText("[:Person {");
      await expect(list).toContainText("}, :Movie {");

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
    const { id, cleanup } = await tableDashboard(
      page,
      "MATCH (m:Movie) WHERE m.title IN ['Cloud Atlas', 'The Matrix'] " +
        "RETURN m ORDER BY m.title",
      { enableGrouping: true, groupBy: "m", enableColumnFilters: true },
    );

    try {
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

  test("a node column filtered by a title shows that title's row only (#2070)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const { id, cleanup } = await tableDashboard(
      page,
      "MATCH (m:Movie) WHERE m.title IN ['Cloud Atlas', 'The Matrix', 'Top Gun'] " +
        "RETURN m ORDER BY m.title",
      { enableColumnFilters: true },
    );

    try {
      await page.goto(`/${id}`);
      const widget = page.getByTestId("widget-card");
      const rows = widget.locator("tbody tr");
      await expect(rows).toHaveCount(3, { timeout: 20_000 });

      // Before: the filter searched "[object Object]" and matched nothing.
      await widget.getByLabel("Filter m").fill("Cloud Atlas");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText('title: "Cloud Atlas"');
    } finally {
      await cleanup();
    }
  });
});
