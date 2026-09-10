/**
 * Per-chart render benchmark (#1688).
 *
 * Mounts every chart's benchmark story (stories/charts/benchmark.stories.tsx)
 * at 1k and 10k rows in light and dark, and records mount → whole chart
 * drawn: from the `neoboard:bench:render` mark the story's decorator sets as
 * React starts rendering it, to the second animation frame after the chart's
 * canvas (ECharts, NVL), Leaflet container or stat tile enters the DOM. The
 * story re-registers the ECharts themes with entry animation and progressive
 * rendering off, so that frame is the whole chart in its final state, not a
 * first 400-item chunk or the start of an animation. NVL is the exception:
 * its force layout keeps running after that frame, so graph's number is the
 * first frame of an unfinished layout.
 *
 * Budgets (per chart, fixtures/benchmark-report.ts) are a printed report, not
 * a gate. The only failures are a chart that never paints, or one that throws
 * — a page error, a console error, Storybook's error screen or BaseChart's
 * inline overlay — checked after the settle wait, so a throw from a later
 * frame counts too. Each sample is appended to a file as it is measured and
 * the table is printed by the global teardown (e2e/benchmark-global-setup.ts),
 * so a failed test loses none. Screenshots land in design-shots/benchmark/
 * (gitignored) for the light and dark columns of component/CHARTS.md.
 */
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
} from "@playwright/test";
import { appendFileSync } from "node:fs";
import path from "node:path";
import {
  BENCHMARK_CHARTS,
  BENCHMARK_ROW_COUNTS,
  type BenchmarkChart,
  type BenchmarkRows,
} from "../src/charts/__tests__/fixtures/benchmark-data";
import type { BenchmarkSample } from "../src/charts/__tests__/fixtures/benchmark-report";
import { BENCHMARK_OUT_DIR, BENCHMARK_SAMPLES } from "./benchmark-global-setup";

declare global {
  interface Window {
    __bench?: { paint: number | null };
  }
}

type Theme = BenchmarkSample["theme"];

const PAINT_TIMEOUT_MS = 60_000;
const RENDER_MARK = "neoboard:bench:render";
/** The first element that means "the chart is on screen", per renderer. */
const PAINTED_SELECTOR = [
  "#storybook-root canvas",
  "#storybook-root .leaflet-container",
  '#storybook-root [data-testid="single-value-chart"]',
].join(", ");
/**
 * No screenshot of graph at 10k. NVL lays it out on the main thread
 * (`disableWebWorkers`) for tens of seconds past its first frame, and a
 * screenshot waits for a frame through that: 16 s locally, most of the
 * 3.5 min this test took on a CI runner. Any frame of an unfinished layout is
 * arbitrary anyway, so graph's look is judged at 1k.
 */
const NO_SCREENSHOT: ReadonlySet<string> = new Set(["graph-10000"]);

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
  screenshot: string | null,
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
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // Chromium logs every request aborted above as a console error against
    // that request's URL — the benchmark's doing, not the chart's.
    const { url } = msg.location();
    if (url && new URL(url).origin !== origin) return;
    errors.push(`console.error: ${msg.text()}`);
  });
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

  // A chart keeps working after the timed frame (NVL layout frames, an option
  // set rebuilt once the container is measured), so every failure check comes
  // after this wait and the screenshot, not before.
  await page.waitForTimeout(1200);
  if (screenshot) await page.screenshot({ path: screenshot });
  expect(errors, "the page threw or logged an error").toEqual([]);
  await expect(page.locator("body.sb-show-errordisplay")).toHaveCount(0);
  await expect(page.locator('#storybook-root [role="alert"]')).toHaveCount(0);
  await context.close();
  return paint - start!;
}

for (const chart of BENCHMARK_CHARTS) {
  for (const rows of BENCHMARK_ROW_COUNTS) {
    test(`${chart} paints ${rows} rows`, async ({
      browser,
      request,
      baseURL,
    }) => {
      const id = await storyId(request, chart, rows);
      const shot = `${chart}-${rows}`;
      for (const theme of ["light", "dark"] as const) {
        const ms = await mountAndMeasure(
          browser,
          baseURL!,
          id,
          theme,
          NO_SCREENSHOT.has(shot)
            ? null
            : path.join(BENCHMARK_OUT_DIR, `${shot}-${theme}.png`),
        );
        const sample: BenchmarkSample = { chart, rows, theme, ms };
        appendFileSync(BENCHMARK_SAMPLES, `${JSON.stringify(sample)}\n`);
      }
    });
  }
}
