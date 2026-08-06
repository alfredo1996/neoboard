import { test, expect, ALICE, createTestDashboard } from "./fixtures";

/**
 * #1419 — every page you had ever visited kept auto-refreshing, so query load
 * scaled with browsing history rather than with what was on screen. Measured on
 * the Chart Reference dashboard: 4.81x the `/api/query` volume for the same 18
 * visible widgets after touring six pages.
 *
 * This is that measurement as a regression test. It counts `/api/query` POSTs
 * over a fixed window while sitting on page 1, then repeats the count after
 * visiting the other pages and returning to page 1. The visible view is
 * identical in both windows, so the counts must be too.
 */

const REFRESH_SECONDS = 5;
/** Long enough for two refresh ticks, short enough to keep the test bearable. */
const SAMPLE_MS = 12_000;

/**
 * Each page must query something *different*.
 *
 * `use-widget-query` keys on `[connectionId, database, query, params,
 * staleTime]` with no widget id, so widgets sharing a query across pages share
 * one TanStack cache entry — and therefore one refetch, however many are
 * mounted. An earlier version of this fixture gave every page the same query
 * and passed identically with and against the fix, measuring nothing. The
 * distinct `LIMIT` is what makes the pages independently pollable.
 */
function page(id: string, title: string, limit: number) {
  return {
    id,
    title,
    widgets: [
      {
        id: `${id}-w1`,
        chartType: "table",
        connectionId: "conn-neo4j-001",
        query: `MATCH (m:Movie) RETURN m.title AS title LIMIT ${limit}`,
        settings: { title: `${title} widget` },
      },
    ],
    gridLayout: [{ i: `${id}-w1`, x: 0, y: 0, w: 12, h: 4 }],
  };
}

test.describe("Hidden pages do not auto-refresh (#1419)", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("query volume depends on the visible page, not on browsing history", async ({
    page: pw,
  }) => {
    test.setTimeout(120_000);

    const { id, cleanup } = await createTestDashboard(
      pw.request,
      `Hidden refresh ${Date.now()}`,
    );

    try {
      await pw.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [
              page("p1", "One", 1),
              page("p2", "Two", 2),
              page("p3", "Three", 3),
            ],
            settings: {
              autoRefresh: true,
              refreshIntervalSeconds: REFRESH_SECONDS,
            },
          },
        },
      });

      // Count every widget query the browser issues, regardless of page.
      let queries = 0;
      pw.on("request", (req) => {
        if (req.url().includes("/api/query") && req.method() === "POST") {
          queries += 1;
        }
      });

      await pw.goto(`/${id}`);
      await expect(
        pw.locator("[data-testid='widget-card']").first(),
      ).toBeVisible({
        timeout: 20_000,
      });
      await expect(pw.locator("table").first()).toBeVisible({
        timeout: 20_000,
      });

      // ── Baseline: only page 1 has ever been opened ────────────────────
      queries = 0;
      await pw.waitForTimeout(SAMPLE_MS);
      const baseline = queries;

      // Auto-refresh must actually be running, or this test proves nothing.
      expect(
        baseline,
        "expected auto-refresh to issue queries during the baseline window",
      ).toBeGreaterThan(0);

      // ── Tour the other pages, then come back to page 1 ────────────────
      for (const title of ["Two", "Three", "One"]) {
        await pw.getByRole("tab", { name: title }).click();
        await pw.waitForTimeout(500);
      }
      await expect(pw.locator("table").first()).toBeVisible({
        timeout: 20_000,
      });

      // ── Same visible view, same window, same count ────────────────────
      queries = 0;
      await pw.waitForTimeout(SAMPLE_MS);
      const afterTour = queries;

      // Before the fix this was ~3x baseline with three pages mounted. Allow
      // one extra tick of slack for timer alignment rather than demanding
      // equality, but nothing close to a second page's worth.
      expect(
        afterTour,
        `hidden pages are still polling: ${afterTour} queries after touring vs ${baseline} on a fresh load`,
      ).toBeLessThanOrEqual(baseline + 1);
    } finally {
      await cleanup();
    }
  });
});
