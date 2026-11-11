import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";

// A card still loading after 5 s offers Stop (#2446). The server cancels
// nothing until #2444, so the sleep outlives the test; 20 s spares the rest.
test.describe("Stopping a slow card", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("Stop appears after 5 s, aborts the request, and Run again starts a new one", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Stop card ${uid()}`,
    );
    try {
      const widget = {
        id: "w0",
        chartType: "table",
        connectionId: "conn-pg-001",
        query: "SELECT pg_sleep(20), 1 AS n",
        settings: { title: "Slow card" },
      };
      const res = await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [
              {
                id: "p1",
                title: "Page 1",
                widgets: [widget],
                gridLayout: [{ i: "w0", x: 0, y: 0, w: 6, h: 4 }],
              },
            ],
          },
        },
      });
      if (!res.ok()) throw new Error(`PUT dashboard failed: ${res.status()}`);

      let sent = 0;
      let failed = 0;
      page.on("request", (r) => {
        if (new URL(r.url()).pathname === "/api/query") sent++;
      });
      page.on("requestfailed", (r) => {
        if (new URL(r.url()).pathname === "/api/query") failed++;
      });

      await page.goto(`/${id}`);
      await expect(
        page.getByText("Loading Slow card…", { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      const stop = page.getByRole("button", { name: "Stop", exact: true });
      await expect(stop).toBeVisible({ timeout: 8_000 });

      await stop.click();
      await expect(page.getByText("Stopped", { exact: true })).toBeVisible({
        timeout: 1_000,
      });
      await expect.poll(() => failed).toBe(1);

      await page
        .getByRole("button", { name: "Run again", exact: true })
        .click();
      await expect(
        page.getByText("Loading Slow card…", { exact: true }),
      ).toBeVisible();
      expect(sent).toBe(2);
    } finally {
      await cleanup();
    }
  });
});
