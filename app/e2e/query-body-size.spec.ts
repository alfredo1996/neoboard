import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";

/**
 * #2477 — behind a proxy that refuses request bodies over 8 KB (AWS WAF's
 * managed Core rule set), a widget whose saved query is longer never loaded:
 * every request carried the full query text. A saved widget now names itself
 * and the server loads the text. `page.route` plays the proxy.
 */
test.describe("A saved widget with a long query loads behind a body-size cap (#2477)", () => {
  test("a 12 KB query runs through a proxy that refuses bodies over 8 KB", async ({
    page,
    authPage,
  }) => {
    test.setTimeout(90_000);
    await authPage.login(ALICE.email, ALICE.password);

    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Long query ${uid()}`,
    );

    try {
      const padding = "x".repeat(12_000);
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
                    id: "long",
                    chartType: "table",
                    connectionId: "conn-neo4j-001",
                    query:
                      "/* " +
                      padding +
                      " */ MATCH (m:Movie) RETURN m.title AS title LIMIT 3",
                    settings: { title: "Long query" },
                  },
                ],
                gridLayout: [{ i: "long", x: 0, y: 0, w: 8, h: 4 }],
              },
            ],
          },
        },
      });

      const sizes: number[] = [];
      await page.route("**/api/query", async (route) => {
        const size = route.request().postDataBuffer()?.length ?? 0;
        sizes.push(size);
        if (size > 8192) {
          await route.fulfill({ status: 403, body: "Forbidden by proxy" });
          return;
        }
        await route.continue();
      });

      await page.goto(`/${id}`);

      await expect(page.locator("table").first()).toBeVisible({
        timeout: 30_000,
      });
      expect(sizes.length).toBeGreaterThan(0);
      expect(Math.max(...sizes)).toBeLessThan(1024);

      // Edit mode runs the same saved widget the same way.
      sizes.length = 0;
      await page.goto(`/${id}/edit`);
      await expect(page.locator("table").first()).toBeVisible({
        timeout: 30_000,
      });
      expect(sizes.length).toBeGreaterThan(0);
      expect(Math.max(...sizes)).toBeLessThan(1024);
    } finally {
      await cleanup();
    }
  });
});
