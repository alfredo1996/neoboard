import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";

/**
 * #2257 — the auto page size budgeted rows at 36 px while they render at 37,
 * so a table at tile height 6 pushed its pager below the card body. The
 * invariant is exact: the body does not scroll and the last pager button sits
 * inside it.
 */
test.describe("Table pager fits its card (#2257)", () => {
  test("a table at tile height 6 shows its pager fully, without internal scroll", async ({
    page,
    authPage,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Pager fit ${uid()}`,
    );
    try {
      await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [
              {
                id: "p1",
                title: "One",
                widgets: [
                  {
                    id: "w1",
                    chartType: "table",
                    connectionId: "conn-neo4j-001",
                    query: "MATCH (m:Movie) RETURN m.title AS title LIMIT 40",
                    settings: { title: "Pager fit" },
                  },
                ],
                gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 6 }],
              },
            ],
          },
        },
      });
      await page.goto(`/${id}`);
      const next = page.getByRole("button", { name: "Next" });
      await expect(next).toBeVisible({ timeout: 20_000 });

      const body = page.locator("[data-testid='widget-card'] section").first();
      const fit = await body.evaluate((el) => ({
        scroll: el.scrollHeight,
        client: el.clientHeight,
        bodyBottom: el.getBoundingClientRect().bottom,
      }));
      const nextBox = await next.boundingBox();
      expect(fit.scroll).toBeLessThanOrEqual(fit.client);
      expect(nextBox!.y + nextBox!.height).toBeLessThanOrEqual(fit.bodyBottom);
    } finally {
      await cleanup();
    }
  });
});
