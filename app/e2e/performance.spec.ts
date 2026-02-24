import type { Page, APIRequestContext } from "@playwright/test";
import { test, expect, ALICE, TEST_NEO4J_BOLT_URL, TEST_PG_PORT } from "./fixtures";

/**
 * Creates temporary Neo4j and PostgreSQL connections for a performance test,
 * using the testcontainer ports supplied by global-setup.ts via env vars.
 * Returns the connection IDs and a cleanup function to delete them.
 */
async function createTestConnections(request: APIRequestContext): Promise<{
  neo4jConnId: string;
  pgConnId: string;
  cleanup: () => Promise<void>;
}> {
  const [neo4jRes, pgRes] = await Promise.all([
    request.post("/api/connections", {
      data: {
        name: "Perf: Neo4j (auto-cleanup)",
        type: "neo4j",
        config: {
          uri: TEST_NEO4J_BOLT_URL,
          username: "neo4j",
          password: "neoboard123",
        },
      },
    }),
    request.post("/api/connections", {
      data: {
        name: "Perf: PostgreSQL (auto-cleanup)",
        type: "postgresql",
        config: {
          uri: `postgresql://localhost:${TEST_PG_PORT}`,
          username: "neoboard",
          password: "neoboard",
          database: "movies",
        },
      },
    }),
  ]);

  if (!neo4jRes.ok()) throw new Error(`Failed to create Neo4j connection: ${await neo4jRes.text()}`);
  if (!pgRes.ok()) throw new Error(`Failed to create PostgreSQL connection: ${await pgRes.text()}`);

  const { id: neo4jConnId } = (await neo4jRes.json()) as { id: string };
  const { id: pgConnId } = (await pgRes.json()) as { id: string };

  return {
    neo4jConnId,
    pgConnId,
    cleanup: () =>
      Promise.all([
        request.delete(`/api/connections/${neo4jConnId}`),
        request.delete(`/api/connections/${pgConnId}`),
      ]).then(() => undefined),
  };
}

/**
 * Wait for the browser to complete two animation frames.
 * More reliable than an arbitrary sleep for "paint microtask" settling —
 * works correctly under CI load and doesn't add unnecessary wall-clock time.
 */
async function waitForNextPaint(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

test.describe("Performance — tab switching", () => {
  test("tab switch — time to visible + data-loaded state", async ({
    page,
    authPage,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);

    // Navigate to a seeded dashboard that has multiple pages ("Movie Analytics")
    await page.getByText("Movie Analytics").click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // Wait for the initial page load to fully settle.
    // domcontentloaded is preferred over networkidle — networkidle is flaky
    // on apps with long-polling or periodic fetches.
    await page.waitForLoadState("domcontentloaded");

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

test.describe("Performance — concurrent multi-connector queries", () => {
  /**
   * Creates a dashboard with 30 Neo4j + 30 PostgreSQL single-value widgets,
   * interleaved in the grid layout, then navigates to it and measures:
   *   - Full load time (navigation start → all 60 queries resolved)
   *   - Grid items rendered count
   *   - Loading widget delta (60 → 0)
   *
   * This exercises the per-connector concurrency queues simultaneously,
   * revealing saturation differences between the two connectors.
   * Cleans up the dashboard regardless of test outcome.
   */
  test("60 interleaved widgets (30 Neo4j + 30 PostgreSQL) — concurrent resolution", async ({
    page,
    authPage,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);

    const NEO4J_COUNT = 30;
    const PG_COUNT = 30;
    const TOTAL = NEO4J_COUNT + PG_COUNT;

    // ── 1. Build interleaved widget list ────────────────────────────────────
    // Alternating Neo4j / PostgreSQL so both queues are hit simultaneously
    const widgets = Array.from({ length: TOTAL }, (_, i) => {
      const isNeo4j = i % 2 === 0;
      return {
        id: `perf-mc-w${i + 1}`,
        chartType: "single-value",
        connectionId: isNeo4j ? "conn-neo4j-001" : "conn-pg-001",
        query: isNeo4j ? "RETURN 1 AS value" : "SELECT 1 AS value",
        params: {},
        settings: {
          title: `${isNeo4j ? "Neo4j" : "PG"} Widget ${Math.floor(i / 2) + 1}`,
        },
      };
    });

    // 6 widgets per row (w=2 in a 12-column grid)
    const gridLayout = widgets.map((w, i) => ({
      i: w.id,
      x: (i % 6) * 2,
      y: Math.floor(i / 6) * 2,
      w: 2,
      h: 2,
    }));

    // ── 2. Create the test dashboard ─────────────────────────────────────────
    const createRes = await page.request.post("/api/dashboards", {
      data: { name: "Perf: Multi-Connector Concurrent (auto-cleanup)" },
    });
    expect(createRes.status()).toBe(201);
    const { id: dashboardId } = (await createRes.json()) as { id: string };

    const updateRes = await page.request.put(`/api/dashboards/${dashboardId}`, {
      data: {
        layoutJson: {
          version: 2,
          pages: [{ id: "page-1", title: "Page 1", widgets, gridLayout }],
        },
      },
    });
    expect(updateRes.status()).toBe(200);

    // ── 3. Navigate and measure ──────────────────────────────────────────────
    try {
      const t0 = Date.now();
      await page.goto(`/${dashboardId}`);

      // Gate: wait for all TOTAL card containers to mount before checking
      // loading state — without this, 0 === 0 passes immediately
      await page.waitForFunction(
        (count) =>
          document.querySelectorAll('[data-testid="widget-card"]').length >=
          count,
        TOTAL,
        { timeout: 30_000 }
      );

      // Pre-resolution snapshot: all cards mounted, queries still in flight
      const preResolution = await page.evaluate(() => ({
        totalLoading: document.querySelectorAll('[data-loading="true"]').length,
        gridItemsRendered: document.querySelectorAll(".react-grid-item").length,
      }));

      // Wait for every widget (both connectors) to resolve
      await page.waitForFunction(
        () => document.querySelectorAll('[data-loading="true"]').length === 0,
        { timeout: 60_000 }
      );

      await waitForNextPaint(page);
      const t1 = Date.now();
      const ms = t1 - t0;

      // Post-resolution snapshot
      const postResolution = await page.evaluate(() => ({
        totalLoading: document.querySelectorAll('[data-loading="true"]').length,
        gridItemsRendered: document.querySelectorAll(".react-grid-item").length,
      }));

      // ── Report ────────────────────────────────────────────────────────
      console.log(`\n=== Multi-Connector Concurrent (${TOTAL} widgets) ===`);
      console.log(`  Neo4j widgets      : ${NEO4J_COUNT}`);
      console.log(`  PostgreSQL widgets  : ${PG_COUNT}`);
      console.log(`  Full load time      : ${ms.toFixed(1)} ms`);
      console.log(
        `  Loading widgets (pre): ${preResolution.totalLoading} → (post) ${postResolution.totalLoading}`
      );
      console.log(
        `  Grid items rendered  : ${postResolution.gridItemsRendered}`
      );
      console.log("");

      // ── Thresholds ────────────────────────────────────────────────────
      expect(
        ms,
        `${TOTAL}-widget mixed-connector dashboard exceeded 30 000 ms`
      ).toBeLessThan(30_000);

      expect(
        postResolution.gridItemsRendered,
        `Expected ${TOTAL} grid items, got ${postResolution.gridItemsRendered}`
      ).toBe(TOTAL);

      expect(
        postResolution.totalLoading,
        "Some widgets still in loading state after timeout"
      ).toBe(0);
    } finally {
      // ── 4. Cleanup ───────────────────────────────────────────────────────
      await page.request.delete(`/api/dashboards/${dashboardId}`);
    }
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
      // Register the PerformanceObserver BEFORE navigating so it runs as an
      // init script on the next page load (page.goto below).
      await page.addInitScript(() => {
        (window as Window & { __longTaskCount?: number }).__longTaskCount = 0;
        try {
          new PerformanceObserver((list) => {
            (window as Window & { __longTaskCount?: number }).__longTaskCount =
              ((window as Window & { __longTaskCount?: number }).__longTaskCount ?? 0) +
              list.getEntries().length;
          }).observe({ type: "longtask", buffered: true });
        } catch {
          // longtask observer not supported in this browser
        }
      });

      // BUG FIX 1: use Date.now() (Node.js process clock) instead of
      // page.evaluate(performance.now).  The browser's performance.now()
      // timeline resets to ~0 on every page navigation, so t0 captured on the
      // list page and t1 captured on the new dashboard page would produce a
      // large negative number (e.g. −12 039 ms).
      const t0 = Date.now();

      await page.goto(`/${dashboardId}`);

      // Wait for all WIDGET_COUNT card containers to mount.
      // This is the critical gate that ensures React has rendered every widget
      // before we check loading state — without it, 0 loading elements would
      // pass the next waitForFunction immediately (0 === 0).
      await page.waitForFunction(
        (count) =>
          document.querySelectorAll('[data-testid="widget-card"]').length >=
          count,
        WIDGET_COUNT,
        { timeout: 30_000 }
      );

      // ── Pre-resolution snapshot: all cards mounted, queries still in flight
      const preResolutionMetrics = await page.evaluate(() => {
        const mem = (
          performance as Performance & {
            memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
          }
        ).memory;
        return {
          domNodeCount: document.querySelectorAll("*").length,
          // loadingEls and gridItemsRendered are the metrics that meaningfully
          // change for single-value widgets (DOM node count stays constant
          // because a skeleton and a rendered value have the same complexity).
          loadingEls: document.querySelectorAll('[data-loading="true"]').length,
          gridItemsRendered: document.querySelectorAll(".react-grid-item").length,
          jsHeapUsedMb: mem ? +(mem.usedJSHeapSize / 1_048_576).toFixed(1) : null,
        };
      });

      // Wait until every widget loading skeleton has resolved (success or error).
      await page.waitForFunction(
        () => document.querySelectorAll('[data-loading="true"]').length === 0,
        { timeout: 60_000 }
      );

      // Wait for remaining paint microtasks (e.g. ECharts canvas) to settle.
      await waitForNextPaint(page);

      // BUG FIX 1 (continued): t1 also uses Date.now() for the same reason.
      const t1 = Date.now();
      const ms = t1 - t0;

      // ── Post-resolution snapshot: all queries resolved
      const postResolutionMetrics = await page.evaluate(() => {
        const mem = (
          performance as Performance & {
            memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
          }
        ).memory;
        const nav = performance.getEntriesByType(
          "navigation"
        )[0] as PerformanceNavigationTiming | undefined;
        const fcp =
          performance
            .getEntriesByName("first-contentful-paint")
            .at(0)?.startTime ?? null;
        const longTaskCount =
          (window as Window & { __longTaskCount?: number }).__longTaskCount ??
          null;
        return {
          domNodeCount: document.querySelectorAll("*").length,
          loadingEls: document.querySelectorAll('[data-loading="true"]').length,
          gridItemsRendered: document.querySelectorAll(".react-grid-item").length,
          jsHeapUsedMb: mem ? +(mem.usedJSHeapSize / 1_048_576).toFixed(1) : null,
          ttfbMs: nav ? +(nav.responseStart - nav.startTime).toFixed(1) : null,
          fcpMs: fcp !== null ? +fcp.toFixed(1) : null,
          longTaskCount,
        };
      });

      // ── Report ────────────────────────────────────────────────────────
      console.log(`\n=== Large Dashboard (${WIDGET_COUNT} widgets) ===`);
      console.log(`  Full load time         : ${ms.toFixed(1)} ms`);
      console.log(`  TTFB                   : ${postResolutionMetrics.ttfbMs ?? "n/a"} ms`);
      console.log(`  First Contentful Paint : ${postResolutionMetrics.fcpMs ?? "n/a"} ms`);
      console.log(`  DOM nodes              : ${postResolutionMetrics.domNodeCount}`);
      console.log(`  Grid items rendered    : ${postResolutionMetrics.gridItemsRendered}`);
      // loadingEls: the key pre→post delta for single-value widgets.
      // DOM node count stays flat because a skeleton and a rendered value have
      // identical complexity. loadingEls going 100→0 confirms all resolved.
      console.log(
        `  Loading widgets (pre)  : ${preResolutionMetrics.loadingEls} → (post) ${postResolutionMetrics.loadingEls}`
      );
      if (preResolutionMetrics.jsHeapUsedMb !== null) {
        console.log(`  JS heap used           : ${preResolutionMetrics.jsHeapUsedMb} MB → ${postResolutionMetrics.jsHeapUsedMb} MB`);
      }
      if (postResolutionMetrics.longTaskCount !== null) {
        console.log(`  Long tasks (>50 ms)    : ${postResolutionMetrics.longTaskCount}`);
      }
      console.log("");

      // ── Thresholds ────────────────────────────────────────────────────
      expect(
        ms,
        `${WIDGET_COUNT}-widget dashboard exceeded 30 000 ms threshold`
      ).toBeLessThan(30_000);

      // All widget cards must have rendered and resolved
      expect(
        postResolutionMetrics.gridItemsRendered,
        `Expected ${WIDGET_COUNT} grid items, got ${postResolutionMetrics.gridItemsRendered}`
      ).toBe(WIDGET_COUNT);

      expect(
        postResolutionMetrics.loadingEls,
        "Some widgets still in loading state after timeout"
      ).toBe(0);
    } finally {
      // ── 4. Cleanup — runs even when the test fails ───────────────────────
      await page.request.delete(`/api/dashboards/${dashboardId}`);
    }
  });
});
