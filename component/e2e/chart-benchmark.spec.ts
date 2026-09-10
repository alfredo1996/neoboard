/**
 * Per-chart render benchmark (#1688).
 *
 * Mounts every chart's benchmark story (stories/charts/benchmark.stories.tsx)
 * at 1k and 10k rows in light and dark, and records time-to-first-paint:
 * from the `neoboard:bench:render` mark the story's decorator sets as React
 * starts rendering it, to the second animation frame after the chart's
 * canvas (ECharts, NVL), Leaflet container or stat tile enters the DOM — i.e.
 * the first frame with the chart on it has been composited.
 *
 * Budgets are a printed report, not a gate: the only failures are a chart
 * that throws (page error, Storybook's error screen, BaseChart's inline
 * overlay) or never paints. The screenshots land in design-shots/benchmark/
 * (gitignored) for the light/dark review column of component/CHARTS.md.
 */
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
} from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BENCHMARK_CHARTS,
  BENCHMARK_ROW_COUNTS,
  type BenchmarkChart,
  type BenchmarkRows,
} from "../src/charts/__tests__/fixtures/benchmark-data";

declare global {
  interface Window {
    __bench?: { paint: number | null };
  }
}

type Theme = "light" | "dark";

/** Starting budgets from the issue; tune after the first runs. */
const BUDGET_MS: Record<BenchmarkRows, number> = { 1000: 300, 10000: 1500 };
const PAINT_TIMEOUT_MS = 60_000;
const OUT_DIR = fileURLToPath(
  new URL("../../design-shots/benchmark", import.meta.url),
);
const RENDER_MARK = "neoboard:bench:render";
/** The first element that means "the chart is on screen", per renderer. */
const PAINTED_SELECTOR = [
  "#storybook-root canvas",
  "#storybook-root .leaflet-container",
  '#storybook-root [data-testid="single-value-chart"]',
].join(", ");

interface Sample {
  chart: BenchmarkChart;
  rows: BenchmarkRows;
  theme: Theme;
  ms: number;
}
const samples: Sample[] = [];

interface IndexEntry {
  id: string;
  name: string;
  tags?: string[];
}

async function storyId(
  request: APIRequestContext,
  chart: BenchmarkChart,
  rows: BenchmarkRows,
): Promise<string> {
  const index = (await (await request.get("/index.json")).json()) as {
    entries: Record<string, IndexEntry>;
  };
  const wanted = `${chart} ${rows / 1000}k`;
  const entry = Object.values(index.entries).find(
    (e) => e.tags?.includes("benchmark") && e.name === wanted,
  );
  expect(
    entry,
    `no story tagged "benchmark" named "${wanted}" in the Storybook index`,
  ).toBeDefined();
  return entry!.id;
}

async function mountAndMeasure(
  browser: Browser,
  baseURL: string,
  id: string,
  theme: Theme,
  screenshot: string,
): Promise<number> {
  const context = await browser.newContext({
    colorScheme: theme,
    viewport: { width: 1280, height: 720 },
  });
  // Map tiles come from the public internet; anything off the local server
  // is aborted so the number is the chart, not the network.
  const origin = new URL(baseURL).origin;
  await context.route(
    (url) => url.origin !== origin,
    (route) => route.abort(),
  );
  await context.addInitScript((selector: string) => {
    window.__bench = { paint: null };
    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) return;
      observer.disconnect();
      // Frame 1 draws the chart; frame 2 starts after it was composited.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          window.__bench!.paint = performance.now();
        }),
      );
    });
    observer.observe(document, { childList: true, subtree: true });
  }, PAINTED_SELECTOR);

  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`,
  );
  await page.waitForFunction(() => window.__bench?.paint !== null, null, {
    timeout: PAINT_TIMEOUT_MS,
  });
  const { start, paint } = await page.evaluate(
    (mark) => ({
      start: performance.getEntriesByName(mark)[0]?.startTime,
      paint: window.__bench!.paint!,
    }),
    RENDER_MARK,
  );
  expect(
    start,
    `no "${RENDER_MARK}" mark — is the benchmark decorator on?`,
  ).toBeDefined();

  expect(errors, "the page threw").toEqual([]);
  await expect(page.locator("body.sb-show-errordisplay")).toHaveCount(0);
  await expect(page.locator('#storybook-root [role="alert"]')).toHaveCount(0);

  // Let the entry animation settle before the design-review shot.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: screenshot });
  await context.close();
  return paint - start!;
}

test.beforeAll(() => mkdirSync(OUT_DIR, { recursive: true }));

for (const chart of BENCHMARK_CHARTS) {
  for (const rows of BENCHMARK_ROW_COUNTS) {
    test(`${chart} paints ${rows} rows`, async ({
      browser,
      request,
      baseURL,
    }) => {
      const id = await storyId(request, chart, rows);
      for (const theme of ["light", "dark"] as const) {
        const ms = await mountAndMeasure(
          browser,
          baseURL!,
          id,
          theme,
          path.join(OUT_DIR, `${chart}-${rows}-${theme}.png`),
        );
        samples.push({ chart, rows, theme, ms });
      }
    });
  }
}

test.afterAll(() => {
  if (samples.length === 0) return;
  // Light and dark are the same work, so they are two samples of one number.
  // The best of the two is reported: the first run measured a 10k NVL layout
  // still winding down as the next story mounted (880 ms for a stat tile).
  const cell = (chart: BenchmarkChart, rows: BenchmarkRows) => {
    const runs = samples.filter((x) => x.chart === chart && x.rows === rows);
    if (runs.length === 0) return "—";
    const ms = Math.round(Math.min(...runs.map((x) => x.ms)));
    return `${ms}${ms > BUDGET_MS[rows] ? " !" : ""}`;
  };
  const lines = [
    "",
    "Chart render benchmark — mount → first paint, best of light/dark (ms)",
    "chart            1k        10k",
    ...BENCHMARK_CHARTS.map(
      (c) => `${c.padEnd(16)} ${cell(c, 1000).padEnd(9)} ${cell(c, 10000)}`,
    ),
    `${"budget".padEnd(16)} ≤${BUDGET_MS[1000]}      ≤${BUDGET_MS[10000]}   (! = over budget; report only)`,
    "",
  ];
  console.log(lines.join("\n"));
  writeFileSync(
    path.join(OUT_DIR, "results.json"),
    JSON.stringify(
      { date: new Date().toISOString(), budgetMs: BUDGET_MS, samples },
      null,
      2,
    ),
  );
});
