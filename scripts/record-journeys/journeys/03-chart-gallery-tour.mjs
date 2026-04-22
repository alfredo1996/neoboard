/**
 * Journey 3: Tour the Chart Gallery demo dashboard
 *
 * Demonstrates: multiple chart types, page tabs, dark mode toggle.
 */
import { login } from "../helpers/login.mjs";
import { narrate, clearNarration } from "../helpers/narrate.mjs";
import { wait, SHORT, MEDIUM, LONG, HERO } from "../helpers/pace.mjs";

export const title = "Chart Gallery Tour";

const TABS_TO_VISIT = [
  { name: "1. Bar", desc: "Bar chart — categorical comparison" },
  { name: "2. Line", desc: "Line chart — trends over time" },
  { name: "3. Pie / Donut", desc: "Pie & Donut — proportions" },
  { name: "5. Single Value (KPI)", desc: "Single Value — key metrics at a glance" },
  { name: "6. Gauge", desc: "Gauge — bounded metrics with thresholds" },
  { name: "14. Sankey", desc: "Sankey — flow between categories" },
  { name: "15. Treemap", desc: "Treemap — hierarchical proportions" },
  { name: "16. Sunburst", desc: "Sunburst — nested arcs" },
  { name: "17. Radar", desc: "Radar — multi-axis comparison" },
];

export async function run(page) {
  await login(page);

  await narrate(page, "Opening the Chart Gallery demo dashboard");
  // Click the Chart Gallery card
  await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="cursor-pointer"]');
    for (const c of cards) {
      if (c.textContent?.includes("Chart Gallery")) {
        c.click();
        return;
      }
    }
  });
  await wait(page, HERO);

  // Tour each chart type tab
  for (const tab of TABS_TO_VISIT) {
    await narrate(page, tab.desc);
    const tabEl = page.getByRole("tab", { name: tab.name });
    await tabEl.click();
    await wait(page, MEDIUM);

    // Scroll down to see the chart widget
    await page.evaluate(() => window.scrollTo({ top: 350, behavior: "smooth" }));
    await wait(page, HERO);

    // Scroll back up for next tab
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await wait(page, SHORT);
  }

  // Toggle dark mode
  await narrate(page, "Toggle dark mode — all charts adapt automatically");
  await page.getByRole("button", { name: "Theme" }).click();
  await wait(page, SHORT);
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await wait(page, LONG);

  // Show a couple charts in dark mode
  await page.getByRole("tab", { name: "6. Gauge" }).click();
  await wait(page, MEDIUM);
  await page.evaluate(() => window.scrollTo({ top: 350, behavior: "smooth" }));
  await wait(page, HERO);

  await narrate(page, "Gauge in dark mode — theme-aware colors");
  await wait(page, LONG);

  await page.getByRole("tab", { name: "17. Radar" }).click();
  await wait(page, MEDIUM);
  await page.evaluate(() => window.scrollTo({ top: 350, behavior: "smooth" }));
  await wait(page, HERO);

  await narrate(page, "Radar in dark mode — readable axis labels, subtle grid");
  await wait(page, LONG);

  // Switch back to light
  await page.getByRole("button", { name: "Theme" }).click();
  await wait(page, SHORT);
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await wait(page, MEDIUM);

  await narrate(page, "That's the Chart Gallery — 17 chart types, all customizable");
  await wait(page, HERO);

  await clearNarration(page);
  await wait(page, SHORT);
}
