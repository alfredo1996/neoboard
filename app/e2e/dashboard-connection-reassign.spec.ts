import {
  test,
  expect,
  ALICE,
  BOB,
  TEST_NEO4J_BOLT_URL,
  createTestDashboard,
} from "./fixtures";
import { AuthPage } from "./pages/auth";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Per-dashboard connection reassignment (#1376) and the post-import bulk fix
 * (#1377).
 *
 * The invariant that only a real database can prove is ISOLATION: reassigning
 * one dashboard must not touch another dashboard using the same source. The old
 * connection-scoped endpoint rewrote every dashboard the caller could edit, and
 * no unit test with a mocked driver can tell the difference.
 */

const SEEDED_NEO4J = "conn-neo4j-001";

/** A NeoBoard export with one query widget and one markdown widget. */
function exportPayload(name: string) {
  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    dashboard: { name, description: null },
    connections: { conn_0: { name: "Source Graph", type: "neo4j" } },
    layout: {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "Page 1",
          widgets: [
            {
              id: "w1",
              chartType: "table",
              connectionId: "conn_0",
              query: "MATCH (n) RETURN count(n) AS total",
              settings: { title: "Node Count" },
            },
            // Content-only: exported with connectionId "" because it never had
            // one. Must never be counted or re-assigned.
            {
              id: "md1",
              chartType: "markdown",
              connectionId: "",
              query: "",
              settings: { title: "Notes", content: "## Read me" },
            },
          ],
          gridLayout: [
            { i: "w1", x: 0, y: 0, w: 6, h: 4 },
            { i: "md1", x: 6, y: 0, w: 6, h: 4 },
          ],
        },
      ],
    },
  };
}

/** Widgets of page 1, straight from the API. */
async function widgetsOf(
  request: { get: (u: string) => Promise<{ json: () => Promise<unknown> }> },
  id: string,
) {
  const res = await request.get(`/api/dashboards/${id}`);
  const body = (await res.json()) as {
    data: {
      layoutJson: {
        pages: Array<{
          widgets: Array<{ id: string; connectionId: string }>;
        }>;
      };
    };
  };
  return body.data.layoutJson.pages[0].widgets;
}

const openCardMenu = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  name: string,
) => {
  const card = page
    .locator('[data-testid="dashboard-card"]')
    .filter({ hasText: name })
    .first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole("button", { name: "Dashboard options" }).click();
};

// ---------------------------------------------------------------------------
// The isolation invariant
// ---------------------------------------------------------------------------

test.describe("Per-dashboard connection reassignment", () => {
  test("reassigns one dashboard and leaves the other on the source", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(120_000);
    await authPage.login(ALICE.email, ALICE.password);

    const stamp = Date.now();
    // A second Neo4j connection pointing at the same container, so widgets
    // still resolve after the move and the connector-type guard is satisfied.
    const createConn = await page.request.post("/api/connections", {
      data: {
        name: `Reassign Target ${stamp}`,
        type: "neo4j",
        config: {
          uri: TEST_NEO4J_BOLT_URL,
          username: "neo4j",
          password: "neoboard123",
        },
      },
    });
    expect(createConn.status()).toBe(201);
    const targetConnId = (await createConn.json()).data.id as string;
    const targetConnName = `Reassign Target ${stamp}`;

    // Import the SAME export twice, both mapped to the seeded connection.
    const names = [`Reassign A ${stamp}`, `Reassign B ${stamp}`];
    const ids: string[] = [];
    for (const name of names) {
      const res = await page.request.post("/api/dashboards/import", {
        data: {
          payload: exportPayload(name),
          connectionMapping: { conn_0: SEEDED_NEO4J },
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      // A fully-mapped import containing a markdown widget must NOT claim that
      // a widget is missing a connection (#1377 false alarm).
      expect(body.data.unassignedWidgetCount).toBe(0);
      expect(
        (body.data.notes as string[]).some((n) =>
          /without a connection/i.test(n),
        ),
      ).toBe(false);
      ids.push(body.data.id as string);
    }
    const [first, second] = ids;

    try {
      await page.goto("/");

      // ── Reassign the FIRST dashboard only, via the card menu ───────────
      await openCardMenu(page, names[0]);
      await page
        .getByRole("menuitem", { name: /Change connection/i })
        .click({ timeout: 10_000 });

      const dialog = page.getByRole("dialog", { name: "Change connection" });
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      // Only the query widget is bucketed — the markdown widget is excluded.
      await expect(dialog.getByText("1 widget").first()).toBeVisible({
        timeout: 10_000,
      });

      await dialog.locator(`#reassign-source-${SEEDED_NEO4J}`).click();
      await dialog
        .locator("#reassign-dashboard-target")
        .selectOption(targetConnId);
      await expect(
        dialog.getByText(
          new RegExp(`This will change 1 widget on ${names[0]}`),
        ),
      ).toBeVisible();
      await dialog
        .getByRole("button", { name: "Change connection" })
        .click({ timeout: 10_000 });

      await expect(
        dialog.getByText(
          new RegExp(`Moved 1 widget to ${targetConnName}`, "i"),
        ),
      ).toBeVisible({ timeout: 20_000 });
      await dialog.getByRole("button", { name: "Done" }).click();

      // ── The invariant ─────────────────────────────────────────────────
      const firstWidgets = await widgetsOf(page.request, first);
      const secondWidgets = await widgetsOf(page.request, second);

      expect(firstWidgets.find((w) => w.id === "w1")!.connectionId).toBe(
        targetConnId,
      );
      // The other dashboard is STILL on the source — this is what the global
      // reassign got wrong.
      expect(secondWidgets.find((w) => w.id === "w1")!.connectionId).toBe(
        SEEDED_NEO4J,
      );
      // The markdown widget was not stamped with a connector on either side.
      expect(firstWidgets.find((w) => w.id === "md1")!.connectionId).toBe("");

      // ── Both dashboards still load their data ─────────────────────────
      for (const id of ids) {
        await page.goto(`/${id}`);
        await expect(page.getByText("Node Count")).toBeVisible({
          timeout: 20_000,
        });
        await expect(page.getByText(/Query Failed|No connection/i)).toHaveCount(
          0,
          { timeout: 20_000 },
        );
      }
    } finally {
      for (const id of ids) {
        await page.request.delete(`/api/dashboards/${id}`);
      }
      await page.request.delete(`/api/connections/${targetConnId}`);
    }
  });

  // ── #1377: import that skipped a connection, fixed in bulk ────────────
  test("fills in widgets left without a connection straight from the import dialog", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(120_000);
    await authPage.login(ALICE.email, ALICE.password);

    const stamp = Date.now();
    const name = `Skipped Import ${stamp}`;
    const tmpFile = path.join(os.tmpdir(), `neoboard-skip-${stamp}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(exportPayload(name)));
    let importedId: string | undefined;

    try {
      await page.goto("/");
      await page.getByRole("button", { name: "Import" }).click();
      const importDialog = page.getByRole("dialog", {
        name: "Import Dashboard",
      });
      await expect(importDialog).toBeVisible({ timeout: 10_000 });
      await importDialog.locator("#import-file").setInputFiles(tmpFile);
      await expect(importDialog.getByText("NeoBoard format")).toBeVisible({
        timeout: 10_000,
      });

      // Skip the only connection — the #1377 starting condition.
      await importDialog.locator('label:has-text("Skip")').first().click();
      const submit = importDialog
        .getByRole("button", { name: "Import" })
        .last();
      await expect(submit).toBeEnabled({ timeout: 10_000 });
      await submit.click();

      // The offer names the count, and it is 1 — the markdown widget is NOT
      // included even though it also has an empty connectionId.
      await expect(page.getByText(/1 widget has no connection/i)).toBeVisible({
        timeout: 20_000,
      });
      await page
        .getByRole("button", { name: "Assign a connection" })
        .click({ timeout: 10_000 });

      // The bulk fix — no widget editor involved.
      const dialog = page.getByRole("dialog", { name: "Change connection" });
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await dialog.locator("#reassign-source-unassigned").click();
      await dialog
        .locator("#reassign-dashboard-target")
        .selectOption(SEEDED_NEO4J);
      await dialog
        .getByRole("button", { name: "Change connection" })
        .click({ timeout: 10_000 });
      await expect(dialog.getByText(/Moved 1 widget/i)).toBeVisible({
        timeout: 20_000,
      });
      await dialog.getByRole("button", { name: "Done" }).click();

      // Confirm on the server, then confirm it renders.
      const listRes = await page.request.get("/api/dashboards");
      const list = (await listRes.json()).data as Array<{
        id: string;
        name: string;
      }>;
      importedId = list.find((d) => d.name === name)!.id;

      const widgets = await widgetsOf(page.request, importedId);
      expect(widgets.find((w) => w.id === "w1")!.connectionId).toBe(
        SEEDED_NEO4J,
      );
      // Never assigned a connector to the markdown widget.
      expect(widgets.find((w) => w.id === "md1")!.connectionId).toBe("");

      await page.goto(`/${importedId}`);
      await expect(page.getByText("Node Count")).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText(/No connection/i)).toHaveCount(0, {
        timeout: 20_000,
      });
    } finally {
      if (importedId) {
        await page.request.delete(`/api/dashboards/${importedId}`);
      }
      fs.rmSync(tmpFile, { force: true });
    }
  });

  // ── Authorization surfaces in the UI, not just the API ────────────────
  test("hides Change connection from a viewer-share user", async ({
    authPage,
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    await authPage.login(ALICE.email, ALICE.password);

    const name = `Viewer Share ${Date.now()}`;
    const { id, cleanup } = await createTestDashboard(page.request, name);

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
                    id: "w1",
                    chartType: "table",
                    connectionId: SEEDED_NEO4J,
                    query: "MATCH (n) RETURN count(n) AS total",
                    settings: { title: "Node Count" },
                  },
                ],
                gridLayout: [{ i: "w1", x: 0, y: 0, w: 6, h: 4 }],
              },
            ],
          },
        },
      });
      const shareRes = await page.request.post(`/api/dashboards/${id}/share`, {
        data: { email: BOB.email, role: "viewer" },
      });
      expect(shareRes.status()).toBe(201);

      // Alice (owner) sees the item.
      await page.goto("/");
      await openCardMenu(page, name);
      await expect(
        page.getByRole("menuitem", { name: /Change connection/i }),
      ).toBeVisible({ timeout: 10_000 });
      await page.keyboard.press("Escape");

      // Bob (viewer share) does not.
      const bobContext = await browser.newContext();
      const bobPage = await bobContext.newPage();
      try {
        // AuthPage, not a hand-rolled fill+click: it waits for the form's
        // data-hydrated signal, without which the click runs a native GET
        // submit and the password lands in the URL (#1272).
        await new AuthPage(bobPage).login(BOB.email, BOB.password);

        await openCardMenu(bobPage, name);
        await expect(
          bobPage.getByRole("menuitem", { name: /Change connection/i }),
        ).toHaveCount(0);
        // The menu did open — this is a missing item, not a missing menu.
        await expect(
          bobPage.getByRole("menuitem", { name: "Export" }),
        ).toBeVisible({ timeout: 10_000 });

        // And the API refuses too, not just the UI.
        const denied = await bobPage.request.post(
          `/api/dashboards/${id}/reassign-connection`,
          { data: { fromConnectionId: SEEDED_NEO4J, targetConnectionId: "x" } },
        );
        expect(denied.status()).toBe(404);
      } finally {
        await bobContext.close();
      }
    } finally {
      await cleanup();
    }
  });
});
