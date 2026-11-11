import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";

// 12 cards on one slow connection used to own the browser's six connections,
// and the navigation's own request queued behind them for ~34 s (#2443).
const CARDS = 12;

test.describe("Leaving a loading dashboard", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("the next page opens at once and no card request is sent after the click", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Slow cards ${uid()}`,
    );
    try {
      // Distinct query text: identical keys share one cached request.
      const widgets = Array.from({ length: CARDS }, (_, i) => ({
        id: `w${i}`,
        chartType: "table",
        connectionId: "conn-pg-001",
        query: `SELECT pg_sleep(20), ${i} AS n`,
        settings: { title: `Slow ${i}` },
      }));
      const res = await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [
              {
                id: "p1",
                title: "Page 1",
                widgets,
                gridLayout: widgets.map((w, i) => ({
                  i: w.id,
                  x: (i % 4) * 3,
                  y: Math.floor(i / 4) * 4,
                  w: 3,
                  h: 4,
                })),
              },
            ],
          },
        },
      });
      if (!res.ok()) throw new Error(`PUT dashboard failed: ${res.status()}`);

      await page.goto(`/${id}`);
      await expect(
        page.getByRole("heading", { name: "Slow 0", exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(1_500);

      let sentAfterClick = 0;
      page.on("request", (r) => {
        if (new URL(r.url()).pathname === "/api/query") sentAfterClick++;
      });
      await page
        .getByRole("button", { name: "Connections", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Connections", exact: true }),
      ).toBeVisible({ timeout: 3_000 });
      expect(sentAfterClick).toBe(0);
    } finally {
      await cleanup();
    }
  });
});
