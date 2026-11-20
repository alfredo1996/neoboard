import {
  test,
  expect,
  ALICE,
  TEST_NEO4J_BOLT_URL,
  TEST_PG_PORT,
  createTestDashboard,
  putPage,
  saveDashboard,
  typeInEditor,
  getPreview,
  editingCrumb,
  uid,
} from "./fixtures";

/**
 * Concept wiring (#2485): a click in a graph-database table sets the
 * parameter of a concept, a SQL widget that uses it filters on the click, and
 * the dashboard keeps working, exported and re-imported, with the concept
 * deleted: it stored only the plain parameter name.
 *
 * Hermetic: both connections, the concept and the dashboards are created here
 * and deleted by id. The seeded ones are not touched.
 */
test.describe("Concept wiring (#2485)", () => {
  test.describe.configure({ timeout: 120_000 });

  const suffix = uid();
  const conceptName = `Customer ${suffix}`;
  const parameter = `customer_${suffix}`;
  const graphName = `wiring-graph-${suffix}`;
  const sqlName = `wiring-sql-${suffix}`;
  const SQL_WIDGET = "sql-by-customer";

  test("a click on a concept's key drives a widget on another connection, and survives the concept", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const connectionIds: string[] = [];
    const dashboardCleanups: (() => Promise<void>)[] = [];
    let conceptId = "";
    try {
      const make = async (
        name: string,
        type: string,
        config: Record<string, string>,
      ) => {
        const res = await page.request.post("/api/connections", {
          data: { name, type, config },
        });
        expect(res.status()).toBe(201);
        const id = (await res.json()).data.id as string;
        connectionIds.push(id);
        return id;
      };
      const graphId = await make(graphName, "neo4j", {
        uri: TEST_NEO4J_BOLT_URL,
        username: "neo4j",
        password: "neoboard123",
      });
      const sqlId = await make(sqlName, "postgresql", {
        uri: `postgresql://localhost:${TEST_PG_PORT}`,
        username: "neoboard",
        password: "neoboard",
        database: "movies",
      });
      const concept = await page.request.post("/api/ontology/concepts", {
        data: {
          name: conceptName,
          parameter,
          description: "",
          sides: [
            {
              connectionId: graphId,
              entityKey: "Movie",
              keyPropertyKey: "title",
            },
            {
              connectionId: sqlId,
              entityKey: "movies",
              keyPropertyKey: "title",
            },
          ],
        },
      });
      expect(concept.status()).toBe(201);
      conceptId = (await concept.json()).data.id as string;

      const { id, cleanup } = await createTestDashboard(
        page.request,
        `Wiring ${suffix}`,
      );
      dashboardCleanups.push(cleanup);
      await putPage(
        page.request,
        id,
        [
          {
            id: SQL_WIDGET,
            chartType: "table",
            connectionId: sqlId,
            query: `SELECT title, released FROM movies WHERE title = $param_${parameter}`,
            settings: { title: "Movie in SQL" },
          },
        ],
        [{ i: SQL_WIDGET, x: 0, y: 0, w: 12, h: 5 }],
      );

      // The creator wires the click in the editor: one button, no typing.
      await page.goto(`/${id}/edit`);
      await expect(editingCrumb(page)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Add Widget" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Add Widget" });
      await dialog
        .getByRole("combobox", { name: "Chart Type", exact: true })
        .click();
      await page.getByRole("option", { name: "Data Table" }).click();
      await dialog
        .getByRole("combobox", { name: "Connection", exact: true })
        .click();
      // The option's name carries the connector label after the connection's.
      await page
        .getByRole("option", { name: `${graphName} Neo4j`, exact: true })
        .click();
      await typeInEditor(
        dialog,
        page,
        "MATCH (m:Movie) RETURN m.title AS title, m.released AS released ORDER BY m.title LIMIT 20",
      );
      await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
      await expect(getPreview(dialog)).toBeVisible({ timeout: 15_000 });

      await dialog.getByRole("tab", { name: "Behavior" }).click();
      await dialog.getByLabel("Click action").click();
      await dialog.getByRole("button", { name: "Add rule" }).click();
      const rule = dialog.getByRole("group", { name: "Rule 1" });
      // Offered for the key column, and not for the other one.
      await rule.getByRole("combobox", { name: "Column", exact: true }).click();
      await page.getByRole("option", { name: "released", exact: true }).click();
      await expect(
        rule.getByRole("button", { name: /^Set Customer/ }),
      ).toHaveCount(0);
      await rule.getByRole("combobox", { name: "Column", exact: true }).click();
      await page.getByRole("option", { name: "title", exact: true }).click();
      await expect(
        rule.getByRole("button", {
          name: `Set ${conceptName} ($${parameter}) to this title`,
          exact: true,
        }),
      ).toBeVisible({ timeout: 15_000 });
      await rule
        .getByRole("button", {
          name: `Set ${conceptName} ($${parameter}) to this title`,
          exact: true,
        })
        .click();
      await expect(rule.getByText(`$param_${parameter}`)).toBeVisible();
      await dialog.getByRole("button", { name: "Add Widget" }).click();
      await expect(dialog).toBeHidden();
      await saveDashboard(page);

      // A click filters the SQL widget on the other connection.
      const sqlCell = (title: string) =>
        page
          .locator(`[data-widget-id="${SQL_WIDGET}"]`)
          .locator("td")
          .filter({ hasText: title });
      await page.goto(`/${id}`);
      await page
        .getByRole("button", { name: "A Few Good Men", exact: true })
        .click();
      await expect(sqlCell("A Few Good Men").first()).toBeVisible({
        timeout: 15_000,
      });

      // Export, delete the concept, re-import: it still works.
      const exported = await page.request.get(`/api/dashboards/${id}/export`);
      expect(exported.ok()).toBeTruthy();
      const payload = await exported.json();
      expect(JSON.stringify(payload)).not.toContain(conceptId);
      const mapping: Record<string, string> = {};
      for (const [key, c] of Object.entries(
        payload.connections as Record<string, { type: string }>,
      )) {
        mapping[key] = c.type === "neo4j" ? graphId : sqlId;
      }
      expect(
        (await page.request.delete(`/api/ontology/concepts/${conceptId}`)).ok(),
      ).toBeTruthy();
      conceptId = "";

      const imported = await page.request.post("/api/dashboards/import", {
        data: { payload, connectionMapping: mapping },
      });
      expect(imported.status()).toBe(201);
      const importedId = (await imported.json()).data.id as string;
      dashboardCleanups.push(async () => {
        await page.request.delete(`/api/dashboards/${importedId}`);
      });

      await page.goto(`/${importedId}`);
      await page
        .getByRole("button", { name: "A League of Their Own", exact: true })
        .click();
      await expect(sqlCell("A League of Their Own").first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      for (const c of dashboardCleanups) await c();
      if (conceptId) {
        await page.request.delete(`/api/ontology/concepts/${conceptId}`);
      }
      for (const id of connectionIds) {
        await page.request.delete(`/api/connections/${id}?force=true`);
      }
    }
  });
});
