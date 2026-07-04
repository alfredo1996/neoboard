import { test, expect, ALICE, createTestDashboard } from "./fixtures";

// Entering edit mode must preserve the scroll position (#1163). View and edit
// are separate routes under the shared (dashboard) layout, whose <main> is the
// scroll container; the default navigation reset it to the top.
test.describe("Edit mode preserves scroll position (#1163)", () => {
  test("entering edit mode keeps the <main> scroll position", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(60_000);
    await authPage.login(ALICE.email, ALICE.password);

    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Scroll ${Date.now()}`,
    );
    try {
      // Build a tall page: many stacked markdown widgets so the content
      // exceeds the viewport and the container is scrollable.
      const widgets = [];
      const gridLayout = [];
      for (let i = 0; i < 16; i++) {
        widgets.push({
          id: `w${i}`,
          chartType: "markdown",
          connectionId: "",
          query: "",
          settings: {
            title: `Widget ${i}`,
            chartOptions: {
              content: `## Section ${i}\n\nLots of content here.`,
            },
          },
        });
        gridLayout.push({ i: `w${i}`, x: 0, y: i * 5, w: 12, h: 5 });
      }
      await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [{ id: "p1", title: "Main", widgets, gridLayout }],
          },
        },
      });

      await page.goto(`/${id}`);
      await expect(page.getByText("Section 0")).toBeVisible({
        timeout: 15_000,
      });

      // Scroll the <main> container down.
      const before = await page.evaluate(() => {
        const m = document.querySelector("main");
        if (!m) return -1;
        m.scrollTop = 600;
        return m.scrollTop;
      });
      expect(before).toBeGreaterThan(200);

      // Enter edit mode via the keyboard shortcut (most reliable).
      await page.keyboard.press("Meta+e");
      await page.waitForURL(/\/edit/, { timeout: 15_000 });
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);

      // The scroll position must be preserved (not reset to the top).
      const after = await page.evaluate(
        () => document.querySelector("main")?.scrollTop ?? -1,
      );
      expect(after, `scroll reset ${before} -> ${after}`).toBeGreaterThan(
        before - 150,
      );
    } finally {
      await cleanup();
    }
  });
});
