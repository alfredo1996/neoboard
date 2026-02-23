import { test, expect, ALICE } from "./fixtures";

test.describe("Performance — tab switching", () => {
  test("tab switch — time to visible + data-loaded state", async ({
    page,
    authPage,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);

    // Navigate to a seeded dashboard that has multiple pages ("Movie Analytics")
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // Wait for the initial page load to fully settle
    await page.waitForLoadState("networkidle");

    // Ensure all loading indicators from the first page are gone before timing starts
    await page.waitForFunction(
      () => document.querySelectorAll('[data-loading="true"]').length === 0,
      { timeout: 15_000 }
    );

    const tabs = page.locator('[data-testid="page-tab"]');
    const tabCount = await tabs.count();

    if (tabCount < 2) {
      test.skip(
        true,
        "Dashboard has fewer than 2 pages — skipping tab-switch timing"
      );
      return;
    }

    const timings: number[] = [];

    for (let i = 1; i < tabCount; i++) {
      const t0 = await page.evaluate(() => performance.now());

      // dispatchEvent bypasses Playwright's pointer-event interception check.
      // The react-grid-layout content area (position:relative, flex-1) overlaps
      // the tab bar at certain scroll positions, causing .click() to time out.
      // For a timing test the React onClick handler is all that matters.
      await tabs.nth(i).dispatchEvent("click");

      // Wait until no widget loading skeleton is visible in the current page
      await page.waitForFunction(
        () => document.querySelectorAll('[data-loading="true"]').length === 0,
        { timeout: 10_000 }
      );

      const t1 = await page.evaluate(() => performance.now());
      const ms = t1 - t0;
      timings.push(ms);

      console.log(`Tab ${i} switch: ${ms.toFixed(1)} ms`);

      // A tab switch that takes more than 3 s indicates a serious performance problem
      expect(ms, `Tab ${i} switch exceeded 3 000 ms threshold`).toBeLessThan(
        3_000
      );
    }

    const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
    console.log(
      `Average tab switch: ${avg.toFixed(1)} ms over ${timings.length} tab(s)`
    );
  });
});

test.describe("Performance — large dashboard", () => {
  /**
   * Creates a dashboard with 100 widgets via the REST API, navigates to it,
   * and measures:
   *   - Full load time (navigation start → all queries resolved)
   *   - Browser rendering metrics (DOM node count, JS heap, long tasks)
   *
   * Cleans up the dashboard regardless of test outcome.
   */
  test("large dashboard (100 widgets) — full load time + rendering metrics", async ({
    page,
    authPage,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);

    // ── 1. Create the test dashboard ────────────────────────────────────────
    const createRes = await page.request.post("/api/dashboards", {
      data: { name: "Perf: 100-Widget Dashboard (auto-cleanup)" },
    });
    expect(createRes.status()).toBe(201);
    const { id: dashboardId } = (await createRes.json()) as { id: string };

    // ── 2. Build 100 single-value widgets (lightest renderer, real queries) ─
    const WIDGET_COUNT = 100;
    const widgets = Array.from({ length: WIDGET_COUNT }, (_, i) => ({
      id: `perf-w${i + 1}`,
      chartType: "single-value",
      connectionId: "conn-neo4j-001",
      query: "RETURN 1 AS value",
      params: {},
      settings: { title: `Widget ${i + 1}` },
    }));

    // 6 widgets per row (w=2 in a 12-column grid)
    const gridLayout = widgets.map((w, i) => ({
      i: w.id,
      x: (i % 6) * 2,
      y: Math.floor(i / 6) * 2,
      w: 2,
      h: 2,
    }));

    const updateRes = await page.request.put(
      `/api/dashboards/${dashboardId}`,
      {
        data: {
          layoutJson: {
            version: 2,
            pages: [
              {
                id: "page-1",
                title: "Page 1",
                widgets,
                gridLayout,
              },
            ],
          },
        },
      }
    );
    expect(updateRes.status()).toBe(200);

    // ── 3. Navigate and measure ──────────────────────────────────────────────
    try {
      // Attach a PerformanceObserver for long tasks before navigating.
      // Long tasks (>50ms) on the main thread indicate rendering jank.
      await page.addInitScript(() => {
        (window as Window & { __longTaskCount?: number }).__longTaskCount = 0;
        try {
          new PerformanceObserver((list) => {
            (window as Window & { __longTaskCount?: number }).__longTaskCount =
              ((window as Window & { __longTaskCount?: number }).__longTaskCount ?? 0) +
              list.getEntries().length;
          }).observe({ type: "longtask", buffered: true });
        } catch {
          // longtask observer not available in this browser
        }
      });

      const t0 = await page.evaluate(() => performance.now());

      await page.goto(`/${dashboardId}`);

      // Wait for React to render and at least one loading widget to appear.
      // This confirms the dashboard loaded and widget queries are in flight.
      await page.waitForSelector('[data-loading="true"]', {
        state: "attached",
        timeout: 10_000,
      });

      // ── Capture pre-resolution rendering snapshot ──────────────────────
      const preResolutionMetrics = await page.evaluate(() => {
        const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
        return {
          domNodeCount: document.querySelectorAll("*").length,
          jsHeapUsedMb: mem ? +(mem.usedJSHeapSize / 1_048_576).toFixed(1) : null,
          jsHeapTotalMb: mem ? +(mem.totalJSHeapSize / 1_048_576).toFixed(1) : null,
        };
      });

      // Wait until every widget loading skeleton is resolved (success or error).
      await page.waitForFunction(
        () => document.querySelectorAll('[data-loading="true"]').length === 0,
        { timeout: 60_000 }
      );

      const t1 = await page.evaluate(() => performance.now());
      const ms = t1 - t0;

      // ── Capture post-resolution rendering snapshot ─────────────────────
      const postResolutionMetrics = await page.evaluate(() => {
        const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const fcp = performance
          .getEntriesByName("first-contentful-paint")
          .at(0)?.startTime ?? null;
        const longTaskCount =
          (window as Window & { __longTaskCount?: number }).__longTaskCount ?? null;
        return {
          domNodeCount: document.querySelectorAll("*").length,
          jsHeapUsedMb: mem ? +(mem.usedJSHeapSize / 1_048_576).toFixed(1) : null,
          jsHeapTotalMb: mem ? +(mem.totalJSHeapSize / 1_048_576).toFixed(1) : null,
          /** Time from navigation start until first byte received (TTFB). */
          ttfbMs: nav ? +(nav.responseStart - nav.startTime).toFixed(1) : null,
          /** First Contentful Paint (ms from navigation start). */
          fcpMs: fcp !== null ? +fcp.toFixed(1) : null,
          /** Long tasks on the main thread during full load (count). */
          longTaskCount,
        };
      });

      // ── Report ────────────────────────────────────────────────────────
      console.log(
        `\n=== Large Dashboard (${WIDGET_COUNT} widgets) ===`
      );
      console.log(`  Full load time         : ${ms.toFixed(1)} ms`);
      console.log(
        `  TTFB                   : ${postResolutionMetrics.ttfbMs ?? "n/a"} ms`
      );
      console.log(
        `  First Contentful Paint : ${postResolutionMetrics.fcpMs ?? "n/a"} ms`
      );
      console.log(
        `  DOM nodes (pre-load)   : ${preResolutionMetrics.domNodeCount}`
      );
      console.log(
        `  DOM nodes (post-load)  : ${postResolutionMetrics.domNodeCount}`
      );
      if (preResolutionMetrics.jsHeapUsedMb !== null) {
        console.log(
          `  JS heap used (pre)     : ${preResolutionMetrics.jsHeapUsedMb} MB`
        );
        console.log(
          `  JS heap used (post)    : ${postResolutionMetrics.jsHeapUsedMb} MB`
        );
      }
      if (postResolutionMetrics.longTaskCount !== null) {
        console.log(
          `  Long tasks (>50 ms)    : ${postResolutionMetrics.longTaskCount}`
        );
      }
      console.log("");

      // ── Thresholds ────────────────────────────────────────────────────
      // Fail if it takes more than 30 s to resolve all widget queries
      expect(
        ms,
        `${WIDGET_COUNT}-widget dashboard exceeded 30 000 ms threshold`
      ).toBeLessThan(30_000);

      // Fail if the DOM grows to an unreasonable size (render bloat indicator)
      expect(
        postResolutionMetrics.domNodeCount,
        "DOM node count exceeded 10 000 — possible render bloat"
      ).toBeLessThan(10_000);
    } finally {
      // ── 4. Cleanup — runs even when the test fails ───────────────────────
      await page.request.delete(`/api/dashboards/${dashboardId}`);
    }
  });
});
