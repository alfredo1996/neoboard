import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";

/**
 * #1475 — every page you had visited stayed mounted for the session, so a tab
 * tour grew the DOM and heap without bound. At most 3 pages stay mounted now,
 * and a page you just left is still there: going back costs no query.
 */

const PAGES = ["One", "Two", "Three", "Four", "Five"];
const WIDGETS_PER_PAGE = 2;
const MOUNT_CAP = 3;

function page(n: number, title: string) {
  const widgets = [1, 2].map((w) => ({
    id: `p${n}-w${w}`,
    chartType: "table",
    connectionId: "conn-neo4j-001",
    // Distinct per widget: widgets sharing a query share one cache entry.
    query: `MATCH (m:Movie) RETURN m.title AS title LIMIT ${n * 10 + w}`,
    settings: { title: `${title} widget ${w}` },
  }));
  return {
    id: `p${n}`,
    title,
    widgets,
    gridLayout: widgets.map((w, i) => ({
      i: w.id,
      x: i * 6,
      y: 0,
      w: 6,
      h: 4,
    })),
  };
}

test.describe("Dashboard page mount cache (#1475)", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("a tab tour keeps at most 3 pages mounted, and the page just left reopens with no query", async ({
    page: pw,
  }) => {
    test.setTimeout(120_000);
    const { id, cleanup } = await createTestDashboard(
      pw.request,
      `Mount cache ${uid()}`,
    );

    try {
      await pw.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: PAGES.map((title, i) => page(i + 1, title)),
          },
        },
      });

      let queries = 0;
      pw.on("request", (req) => {
        if (req.url().includes("/api/query") && req.method() === "POST") {
          queries += 1;
        }
      });

      await pw.goto(`/${id}`);
      await expect(pw.locator("table").first()).toBeVisible({
        timeout: 20_000,
      });

      for (const title of PAGES.slice(1)) {
        await pw.getByRole("tab", { name: title, exact: true }).click();
        await expect(
          pw
            .getByText(`${title} widget 1`, { exact: true })
            .filter({ visible: true }),
        ).toBeVisible({ timeout: 20_000 });
        expect(
          await pw.locator(".react-grid-item").count(),
          `after opening ${title}`,
        ).toBeLessThanOrEqual(MOUNT_CAP * WIDGETS_PER_PAGE);
      }

      // Let the last page's queries finish, then step back one page.
      await expect(
        pw.locator("table").filter({ visible: true }).first(),
      ).toBeVisible({
        timeout: 20_000,
      });
      queries = 0;
      await pw.getByRole("tab", { name: "Four", exact: true }).click();
      await expect(
        pw
          .getByText("Four widget 1", { exact: true })
          .filter({ visible: true }),
      ).toBeVisible();
      await expect(
        pw.locator("table").filter({ visible: true }).first(),
      ).toBeVisible();
      await pw.waitForTimeout(1_000);
      expect(queries, "going back to a recent page must not query").toBe(0);
    } finally {
      await cleanup();
    }
  });
});
