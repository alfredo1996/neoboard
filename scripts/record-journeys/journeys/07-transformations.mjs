/**
 * Journey 7: Transformations demo dashboard
 *
 * Demonstrates: client-side data transforms — filter, sort, groupBy, etc.
 */
import { login } from "../helpers/login.mjs";
import { narrate, clearNarration } from "../helpers/narrate.mjs";
import { wait, SHORT, MEDIUM, LONG, HERO } from "../helpers/pace.mjs";
import { scrollToFirstChart, scrollToTop } from "../helpers/scroll.mjs";

export const title = "Data Transformations";

export async function run(page) {
  await login(page);

  await narrate(page, "Opening the Transformations demo dashboard");
  await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="cursor-pointer"]');
    for (const c of cards) {
      if (c.textContent?.includes("Transformations")) {
        c.click();
        return;
      }
    }
  });
  await wait(page, HERO);
  await wait(page, LONG);

  // Tour tabs — each shows before/after of a transform
  const tabs = await page.getByRole("tab").all();
  const tabDescs = [
    "Filter — keep only rows matching a condition",
    "Sort — reorder by column, ascending or descending",
    "Group By — aggregate rows into summary stats",
    "Calculated Column — add derived values (e.g. profit = revenue - cost)",
    "Rename — clean up column headers for display",
    "Limit — cap the result set to N rows",
  ];

  for (let i = 0; i < Math.min(tabs.length, tabDescs.length); i++) {
    await scrollToTop(page);
    await wait(page, SHORT);

    await narrate(page, tabDescs[i]);
    await tabs[i].click();
    await wait(page, LONG);

    // Show the actual chart/table, not the markdown
    await scrollToFirstChart(page);
    await wait(page, HERO);

    // Scroll further to show the "after" widget if there are two side-by-side
    await page.evaluate(() => window.scrollBy(0, 400));
    await wait(page, LONG);
  }

  await narrate(page, "Transforms are stacked in order — each step feeds the next");
  await wait(page, LONG);

  await clearNarration(page);
  await wait(page, SHORT);
}
