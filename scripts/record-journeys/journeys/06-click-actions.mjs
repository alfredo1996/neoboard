/**
 * Journey 6: Click Actions demo dashboard
 *
 * Demonstrates: clicking a chart to set parameters, navigate between pages.
 */
import { login } from "../helpers/login.mjs";
import { narrate, clearNarration } from "../helpers/narrate.mjs";
import { wait, SHORT, MEDIUM, LONG, HERO } from "../helpers/pace.mjs";

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

  await narrate(page, "Click Actions let you interact with charts to filter data");
  await page.evaluate(() => window.scrollTo({ top: 350, behavior: "smooth" }));
  await wait(page, HERO);

  // Try clicking on a chart element if a canvas is visible
  const canvas = page.locator("canvas").first();
  if (await canvas.isVisible({ timeout: 3000 }).catch(() => false)) {
    await narrate(page, "Click a bar to set a parameter — other widgets react");
    const box = await canvas.boundingBox();
    if (box) {
      // Click roughly in the middle of the first bar
      await canvas.click({ position: { x: box.width * 0.2, y: box.height * 0.5 } });
      await wait(page, HERO);
    }
  }

  // Check for parameter tags
  await narrate(page, "Active parameters appear as filter tags below the toolbar");
  await wait(page, LONG);

  // Visit another tab
  const tabs = await page.getByRole("tab").all();
  if (tabs.length > 1) {
    await narrate(page, "Navigate to another page — click actions can also switch pages");
    await tabs[1].click();
    await wait(page, MEDIUM);
    await page.evaluate(() => window.scrollTo({ top: 350, behavior: "smooth" }));
    await wait(page, HERO);
  }

  await narrate(page, "Click actions make dashboards interactive without custom code");
  await wait(page, LONG);

  await clearNarration(page);
  await wait(page, SHORT);
}
