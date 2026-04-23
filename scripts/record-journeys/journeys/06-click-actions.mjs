/**
 * Journey 6: Click Actions demo dashboard
 *
 * Demonstrates: clicking a chart to set parameters, navigate between pages.
 */
import { login } from "../helpers/login.mjs";
import { narrate, clearNarration } from "../helpers/narrate.mjs";
import { wait, SHORT, MEDIUM, LONG, HERO } from "../helpers/pace.mjs";
import { scrollToFirstChart, scrollToTop } from "../helpers/scroll.mjs";

export const title = "Click Actions — Interactive Charts";

export async function run(page) {
  await login(page);

  await narrate(page, "Opening the Click Actions demo dashboard");
  await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="cursor-pointer"]');
    for (const c of cards) {
      if (c.textContent?.includes("Click Actions")) {
        c.click();
        return;
      }
    }
  });
  await wait(page, HERO);

  // Wait for data to load
  await wait(page, LONG);

  await narrate(page, "Click Actions let you interact with charts to filter data");
  await scrollToFirstChart(page);
  await wait(page, HERO);

  // Try clicking on a chart bar
  const canvas = page.locator("canvas").first();
  if (await canvas.isVisible({ timeout: 5000 }).catch(() => false)) {
    await narrate(page, "Click a bar to set a parameter — other widgets update automatically");
    const box = await canvas.boundingBox();
    if (box) {
      // Click on the tallest bar (roughly center-left area)
      await canvas.click({
        position: { x: box.width * 0.15, y: box.height * 0.3 },
      });
      await wait(page, HERO);

      await narrate(page, "The parameter is set — linked widgets now filter by this value");
      await wait(page, HERO);

      // Click another bar
      await canvas.click({
        position: { x: box.width * 0.45, y: box.height * 0.4 },
      });
      await wait(page, HERO);
    }
  }

  // Show the parameter tags if visible
  await scrollToTop(page);
  await wait(page, MEDIUM);

  await narrate(page, "Active parameters appear as filter tags in the toolbar");
  await wait(page, LONG);

  // Visit second tab if it exists
  const tabs = await page.getByRole("tab").all();
  if (tabs.length > 1) {
    await narrate(page, "Page 2: click actions can also navigate between dashboard pages");
    await tabs[1].click();
    await wait(page, LONG);
    await scrollToFirstChart(page);
    await wait(page, HERO);
  }

  if (tabs.length > 2) {
    await narrate(page, "Page 3: combined actions — set a parameter AND navigate");
    await tabs[2].click();
    await wait(page, LONG);
    await scrollToFirstChart(page);
    await wait(page, HERO);
  }

  await narrate(page, "Click actions make dashboards interactive without custom code");
  await wait(page, LONG);

  await clearNarration(page);
  await wait(page, SHORT);
}
