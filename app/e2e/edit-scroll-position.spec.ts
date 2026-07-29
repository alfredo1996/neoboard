import { test, expect, ALICE, createTestDashboard } from "./fixtures";

// Entering edit mode must preserve the scroll position (#1163) and must not
// remount the widget tree (#1370). View and edit are separate route segments
// under a shared [id] layout that owns the dashboard UI, so toggling the mode
// re-renders only the (empty) page slot — the same DOM nodes stay put.
test.describe("Edit mode preserves scroll position (#1163, #1370)", () => {
  test("toggling edit mode keeps the <main> scroll position and the same DOM nodes", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(90_000);
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
            pages: [
              { id: "p1", title: "Main", widgets, gridLayout },
              // A second page so PageTabs renders in BOTH modes. Without it,
              // the tab strip appears only in edit mode and the ~36px it adds
              // above the viewport lets scroll anchoring nudge scrollTop,
              // which would make an exact assertion flaky for the wrong reason.
              { id: "p2", title: "Spare", widgets: [], gridLayout: [] },
            ],
          },
        },
      });

      await page.goto(`/${id}`);
      await expect(page.getByText("Section 0")).toBeVisible({
        timeout: 15_000,
      });

      // Tag the first widget card. A remount recreates the node and loses the
      // attribute — React never removes a data-* attribute it doesn't manage,
      // so surviving the toggle is proof the same node stayed mounted.
      await page
        .locator('[data-testid="widget-card"]')
        .first()
        .evaluate((el) => el.setAttribute("data-survivor", "1"));

      // Scroll the <main> container down.
      const before = await page.evaluate(() => {
        const m = document.querySelector("main");
        if (!m) return -1;
        m.scrollTop = 600;
        return m.scrollTop;
      });
      expect(before).toBeGreaterThan(200);

      // ── Enter edit mode via the keyboard shortcut ──────────────────
      await page.keyboard.press("Meta+e");
      await page.waitForURL(/\/edit/, { timeout: 15_000 });
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);

      const after = await page.evaluate(
        () => document.querySelector("main")?.scrollTop ?? -1,
      );
      expect(
        Math.abs(after - before),
        `scroll moved ${before} -> ${after}`,
      ).toBeLessThanOrEqual(2);
      await expect(page.locator('[data-survivor="1"]')).toHaveCount(1);

      // ── Leave edit mode again ──────────────────────────────────────
      await page.keyboard.press("Meta+e");
      await page.waitForURL((url) => !url.pathname.endsWith("/edit"), {
        timeout: 15_000,
      });
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);

      const back = await page.evaluate(
        () => document.querySelector("main")?.scrollTop ?? -1,
      );
      expect(
        Math.abs(back - before),
        `scroll moved on exit ${before} -> ${back}`,
      ).toBeLessThanOrEqual(2);
      await expect(page.locator('[data-survivor="1"]')).toHaveCount(1);
    } finally {
      await cleanup();
    }
  });
});
