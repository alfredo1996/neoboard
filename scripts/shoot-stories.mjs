#!/usr/bin/env node
/**
 * Capture Storybook stories as light/dark PNG pairs for design review (#1261).
 *
 * Design work is verified by looking, in BOTH themes — class-name assertions
 * are not evidence of appearance, and a single-theme review passes things that
 * are only wrong in the other mode (see #1244: the selection colour was fine
 * in light and muddy in dark).
 *
 * Usage:
 *   npm -w component run storybook          # in another shell, must be on :6006
 *   node scripts/shoot-stories.mjs                       # default story set
 *   node scripts/shoot-stories.mjs --out /tmp/before      # choose output dir
 *   node scripts/shoot-stories.mjs --id composed-datagrid--default
 *
 * Capture a "before" set, make the change, capture an "after" set, compare.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const OUT = flag("out", "design-shots");
const BASE = flag("base", "http://localhost:6006/iframe.html");
const only = flag("id", null);

/**
 * Default set: the surfaces that carry the most visual weight. AppShell first
 * because it is the closest thing to the real app in one frame.
 */
const SHOTS = [
  { id: "composed-appshell--full-dashboard", name: "appshell", h: 700 },
  { id: "composed-datagrid--with-pagination", name: "datagrid", h: 420 },
  { id: "charts-barchart--default", name: "barchart", h: 420 },
  { id: "charts-linechart--area", name: "linechart-area", h: 420 },
  { id: "charts-piechart--donut", name: "pie-donut", h: 420 },
  { id: "composed-connectionform--neo-4-j", name: "connection-form", h: 620 },
  { id: "composed-emptystate--with-action", name: "empty-state", h: 420 },
];

const shots = only ? [{ id: only, name: only, h: 700 }] : SHOTS;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

for (const { id, name, h } of shots) {
  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: h },
      deviceScaleFactor: 2,
      colorScheme: theme,
    });
    await page.goto(`${BASE}?id=${id}&viewMode=story&globals=theme:${theme}`, {
      waitUntil: "networkidle",
    });
    // ECharts finishes its first paint after networkidle resolves.
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${name}-${theme}.png` });
    await page.close();
    console.log(`captured ${name}-${theme}`);
  }
}

await browser.close();
console.log(`\nwrote ${shots.length * 2} screenshots to ${OUT}`);
