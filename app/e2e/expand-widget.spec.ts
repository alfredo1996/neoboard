import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  putPage,
  uid,
} from "./fixtures";
import type { Locator, Page } from "@playwright/test";

// #1509: expanding a widget whose tile already rendered must not replay a
// loading state. A MutationObserver records any loading UI that is ever added
// inside the dialog (an absence checked after the fact would pass on a
// transient, #1748), and each case also asserts the widget really drew.
const LOADING =
  "[data-testid='graph-skeleton'], [data-testid='graph-loading-overlay'], [data-testid='skeleton'], .animate-spin, .animate-pulse";

const WIDGETS = [
  {
    id: "w-graph",
    chartType: "graph",
    title: "Expand graph",
    query:
      "MATCH (p:Person {name: 'Keanu Reeves'})-[r]->(m) RETURN p, r, m LIMIT 10",
  },
  {
    id: "w-map",
    chartType: "map",
    title: "Expand map",
    query:
      "UNWIND range(1,5) AS i RETURN 40.0+i AS lat, -73.0+i AS lng, 'Point ' + i AS name",
  },
  {
    id: "w-bar",
    chartType: "bar",
    title: "Expand chart",
    query:
      "UNWIND [{n:'a',v:1},{n:'b',v:2},{n:'c',v:3}] AS r RETURN r.n AS name, r.v AS value",
  },
];

/** Starts recording loading UI added under any dialog; read with `seen`. */
async function watchDialogLoading(page: Page) {
  await page.evaluate((selector) => {
    const w = window as unknown as { __loadingSeen: string[] };
    w.__loadingSeen = [];
    const scan = (n: Node) => {
      if (!(n instanceof Element)) return;
      for (const el of [n, ...n.querySelectorAll(selector)]) {
        if (el.matches(selector) && el.closest("[role='dialog']"))
          w.__loadingSeen.push(el.getAttribute("data-testid") ?? el.className);
      }
    };
    new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach(scan);
    }).observe(document.body, { childList: true, subtree: true });
  }, LOADING);
}

const seen = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __loadingSeen: string[] }).__loadingSeen,
  );

test.describe("Expanding a rendered widget (#1509)", () => {
  let dashboardId = "";
  let cleanup: () => Promise<void> = async () => {};

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const made = await createTestDashboard(page.request, `Expand ${uid()}`);
    dashboardId = made.id;
    cleanup = made.cleanup;
    await putPage(
      page.request,
      dashboardId,
      WIDGETS.map((w) => ({
        id: w.id,
        chartType: w.chartType,
        connectionId: "conn-neo4j-001",
        query: w.query,
        settings: { title: w.title },
      })),
      WIDGETS.map((w, i) => ({ i: w.id, x: i * 4, y: 0, w: 4, h: 5 })),
    );
    await page.goto(`/${dashboardId}`);
  });

  test.afterEach(async () => {
    await cleanup();
  });

  async function expand(page: Page, id: string, tileDrawn: Locator) {
    await expect(tileDrawn).toBeVisible({ timeout: 20_000 });
    await watchDialogLoading(page);
    await page
      .locator(`[data-widget-id='${id}']`)
      .getByRole("button", { name: "Fullscreen", exact: true })
      .click({ force: true });
    return page.getByRole("dialog");
  }

  test("a graph opens on its settled layout, with no skeleton or overlay", async ({
    page,
  }) => {
    const tile = page.locator("[data-widget-id='w-graph']");
    // The tile's layout must have settled, so the copy has positions to open from.
    const dialog = await expand(
      page,
      "w-graph",
      tile.locator("[data-testid='graph-status-bar']"),
    );
    await expect(dialog.locator("canvas").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      dialog.locator("[data-testid='graph-status-bar']"),
    ).toBeVisible();
    // Past the 800 ms fallback that used to end the overlay.
    await page.waitForTimeout(1_000);
    expect(await seen(page)).toEqual([]);
  });

  test("a map opens with no loading state", async ({ page }) => {
    const tile = page.locator("[data-widget-id='w-map']");
    const dialog = await expand(
      page,
      "w-map",
      tile.locator(".leaflet-overlay-pane svg").first(),
    );
    await expect(dialog.locator(".leaflet-container")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      dialog.locator(".leaflet-overlay-pane svg").first(),
    ).toBeVisible({ timeout: 10_000 });
    expect(await seen(page)).toEqual([]);
  });

  test("a chart opens with no loading state", async ({ page }) => {
    const tile = page.locator("[data-widget-id='w-bar']");
    const dialog = await expand(
      page,
      "w-bar",
      tile.locator("[data-testid='base-chart']"),
    );
    await expect(dialog.locator("[data-testid='base-chart']")).toBeVisible({
      timeout: 10_000,
    });
    expect(await seen(page)).toEqual([]);
  });
});
