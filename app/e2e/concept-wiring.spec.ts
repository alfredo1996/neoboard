import type { Locator } from "@playwright/test";
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

      // A table over the graph connection, not a graph canvas: a graph node's
      // click carries only its id until #2526 lands.
      // The creator wires the click in the editor: one button, no typing.
      await page.goto(`/${id}/edit`);
      await expect(editingCrumb(page)).toBeVisible({ timeout: 15_000 });
      await page
        .getByRole("button", { name: "Add Widget", exact: true })
        .first()
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Add Widget",
        exact: true,
      });
      await dialog
        .getByRole("combobox", { name: "Chart Type", exact: true })
        .click();
      await page
        .getByRole("option", { name: "Data Table", exact: true })
        .click();
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

      await dialog.getByRole("tab", { name: "Behavior", exact: true }).click();
      await dialog.getByLabel("Click action").click();
      await dialog
        .getByRole("button", { name: "Add rule", exact: true })
        .click();
      const rule = dialog.getByRole("group", { name: "Rule 1", exact: true });
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
          name: `Set ${conceptName} ($param_${parameter}) to this title`,
          exact: true,
        }),
      ).toBeVisible({ timeout: 15_000 });
      await rule
        .getByRole("button", {
          name: `Set ${conceptName} ($param_${parameter}) to this title`,
          exact: true,
        })
        .click();
      await expect(
        rule.getByText(`$param_${parameter}`, { exact: true }),
      ).toBeVisible();
      await dialog
        .getByRole("button", { name: "Add Widget", exact: true })
        .click();
      await expect(dialog).toBeHidden();
      await saveDashboard(page);

      // A new selector can start from the concept, and then lists only the
      // connections it is mapped on; an existing selector offers no such start.
      await page.goto(`/${id}/edit`);
      await expect(editingCrumb(page)).toBeVisible({ timeout: 15_000 });
      await page
        .getByRole("button", { name: "Add Widget", exact: true })
        .first()
        .click();
      const selectorDialog = page.getByRole("dialog", {
        name: "Add Widget",
        exact: true,
      });
      await selectorDialog
        .getByRole("combobox", { name: "Chart Type", exact: true })
        .click();
      await page
        .getByRole("option", { name: "Parameter Selector", exact: true })
        .click();
      await selectorDialog
        .getByRole("button", {
          name: `New selector for ${conceptName}`,
          exact: true,
        })
        .click();
      await selectorDialog
        .getByRole("combobox", { name: "Connection", exact: true })
        .click();
      await expect(page.getByRole("option")).toHaveCount(2);
      await expect(
        page.getByRole("option", {
          name: `${sqlName} PostgreSQL`,
          exact: true,
        }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page.goto(`/${id}`);

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

  test("the editor stops offering a side once the connection no longer has its entity (#2552)", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const name = `wiring-gone-${suffix}`;
    const pgConfig = (database: string) => ({
      uri: `postgresql://localhost:${TEST_PG_PORT}`,
      username: "neoboard",
      password: "neoboard",
      database,
    });
    let connectionId = "";
    let conceptId = "";
    let cleanup: (() => Promise<void>) | undefined;
    try {
      const made = await page.request.post("/api/connections", {
        data: { name, type: "postgresql", config: pgConfig("movies") },
      });
      expect(made.status()).toBe(201);
      connectionId = (await made.json()).data.id as string;
      const concept = await page.request.post("/api/ontology/concepts", {
        data: {
          name: `Gone ${suffix}`,
          parameter: `gone_${suffix}`,
          description: "",
          sides: [
            { connectionId, entityKey: "movies", keyPropertyKey: "title" },
          ],
        },
      });
      expect(concept.status()).toBe(201);
      conceptId = (await concept.json()).data.id as string;
      const dash = await createTestDashboard(page.request, `Gone ${suffix}`);
      cleanup = dash.cleanup;

      // Opens a table over the connection and picks its `title` column in a
      // new click rule, once the connection's terms have been read.
      const openRule = async () => {
        await page.goto(`/${dash.id}/edit`);
        await expect(editingCrumb(page)).toBeVisible({ timeout: 15_000 });
        const terms = page.waitForResponse(
          (r) => r.url().includes(`/connections/${connectionId}/ontology`),
          { timeout: 30_000 },
        );
        await page
          .getByRole("button", { name: "Add Widget", exact: true })
          .first()
          .click();
        const dialog = page.getByRole("dialog", {
          name: "Add Widget",
          exact: true,
        });
        await dialog
          .getByRole("combobox", { name: "Chart Type", exact: true })
          .click();
        await page
          .getByRole("option", { name: "Data Table", exact: true })
          .click();
        await dialog
          .getByRole("combobox", { name: "Connection", exact: true })
          .click();
        await page
          .getByRole("option", { name: `${name} PostgreSQL`, exact: true })
          .click();
        await typeInEditor(dialog, page, "SELECT 'x' AS title");
        await dialog.getByTitle("Run query (Ctrl+Enter / ⌘+Enter)").click();
        await expect(getPreview(dialog)).toBeVisible({ timeout: 15_000 });
        await terms;
        await dialog
          .getByRole("tab", { name: "Behavior", exact: true })
          .click();
        await dialog.getByLabel("Click action").click();
        await dialog
          .getByRole("button", { name: "Add rule", exact: true })
          .click();
        const rule = dialog.getByRole("group", { name: "Rule 1", exact: true });
        await rule
          .getByRole("combobox", { name: "Column", exact: true })
          .click();
        await page.getByRole("option", { name: "title", exact: true }).click();
        return rule;
      };
      const setButton = (rule: Locator) =>
        rule.getByRole("button", {
          name: `Set Gone ${suffix} ($param_gone_${suffix}) to this title`,
          exact: true,
        });

      // The side is there: offered.
      await expect(setButton(await openRule())).toBeVisible({
        timeout: 15_000,
      });

      // The table is gone from the connection: the Model page's read flags the
      // side, and the editor stops offering it. The parameter field being
      // there is the positive end state the empty offer is read against.
      const moved = await page.request.patch(
        `/api/connections/${connectionId}`,
        {
          data: { config: pgConfig("neoboard") },
        },
      );
      expect(moved.ok()).toBe(true);
      // The connection's structure is cached for minutes: an admin's refresh
      // re-reads it from the new database (the app's own, which has tables but no `movies`).
      const refreshed = await page.request.get(
        `/api/connections/${connectionId}/ontology?refresh=1`,
      );
      expect(refreshed.ok()).toBe(true);
      const read = await page.request.get("/api/ontology/concepts");
      const concepts = (await read.json()).data.concepts as {
        id: string;
        sides: { missing: string | null }[];
      }[];
      expect(concepts.find((c) => c.id === conceptId)?.sides[0].missing).toBe(
        "entity",
      );

      const rule = await openRule();
      await expect(
        rule.getByRole("combobox", { name: "Parameter", exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(setButton(rule)).toHaveCount(0);
    } finally {
      await cleanup?.();
      if (conceptId) {
        await page.request.delete(`/api/ontology/concepts/${conceptId}`);
      }
      if (connectionId) {
        await page.request.delete(
          `/api/connections/${connectionId}?force=true`,
        );
      }
    }
  });
});
