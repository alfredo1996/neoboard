/**
 * Journey 5: Rule-Based Styling demo dashboard
 *
 * Demonstrates: conditional colors on charts based on data thresholds.
 */
import { login } from "../helpers/login.mjs";
import { narrate, clearNarration } from "../helpers/narrate.mjs";
import { wait, SHORT, MEDIUM, LONG, HERO } from "../helpers/pace.mjs";
import { scrollToFirstChart, scrollToTop } from "../helpers/scroll.mjs";

export const title = "Rule-Based Styling";

export async function run(page) {
  await login(page);

  await narrate(page, "Opening the Rule-Based Styling demo dashboard");
  await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="cursor-pointer"]');
    for (const c of cards) {
      if (c.textContent?.includes("Rule-Based Styling")) {
        c.click();
        return;
      }
    }
  });
  await wait(page, HERO);

  // Wait for charts to load
  await wait(page, LONG);

  await narrate(page, "Charts use conditional colors — values above/below thresholds get different colors");
  await scrollToFirstChart(page);
  await wait(page, HERO);

  await narrate(page, "Rules can target bar color, text color, or background");
  // Scroll further to see more charts
  await page.evaluate(() => window.scrollTo({ top: 900, behavior: "smooth" }));
  await wait(page, HERO);

  // Visit other tabs
  const tabs = await page.getByRole("tab").all();
  if (tabs.length > 1) {
    await scrollToTop(page);
    await wait(page, SHORT);

    await narrate(page, "Line chart with styling rules — color by value");
    await tabs[1].click();
    await wait(page, LONG);
    await scrollToFirstChart(page);
    await wait(page, HERO);

    if (tabs.length > 2) {
      await scrollToTop(page);
      await wait(page, SHORT);

      await narrate(page, "Pie chart with styling rules — segment colors by threshold");
      await tabs[2].click();
      await wait(page, LONG);
      await scrollToFirstChart(page);
      await wait(page, HERO);
    }

    if (tabs.length > 3) {
      await scrollToTop(page);
      await wait(page, SHORT);

      await narrate(page, "Table with styling — row and cell-level conditional formatting");
      await tabs[3].click();
      await wait(page, LONG);
      await scrollToFirstChart(page);
      await wait(page, HERO);
    }
  }

  await narrate(page, "Styling rules are configured per-widget in the widget editor");
  await wait(page, LONG);

  await clearNarration(page);
  await wait(page, SHORT);
}
