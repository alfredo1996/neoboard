/**
 * Journey 7: Transformations demo dashboard
 *
 * Demonstrates: client-side data transforms — filter, sort, groupBy, etc.
 */
import { login } from "../helpers/login.mjs";
import { narrate, clearNarration } from "../helpers/narrate.mjs";
import { wait, SHORT, MEDIUM, LONG, HERO } from "../helpers/pace.mjs";

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

  await narrate(page, "Transformations modify query results before charting — no SQL changes needed");
  await page.evaluate(() => window.scrollTo({ top: 350, behavior: "smooth" }));
  await wait(page, HERO);

  // Tour tabs
  const tabs = await page.getByRole("tab").all();
  const tabNames = [
    "filter", "sort", "groupBy", "calculatedColumn", "rename", "limit"
  ];

  for (let i = 0; i < Math.min(tabs.length, 6); i++) {
    const name = tabNames[i] ?? `tab ${i + 1}`;
    await narrate(page, `Transform: ${name} — before/after side by side`);
    await tabs[i].click();
    await wait(page, MEDIUM);
    await page.evaluate(() => window.scrollTo({ top: 350, behavior: "smooth" }));
    await wait(page, HERO);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await wait(page, SHORT);
  }

  await narrate(page, "Transforms are stacked in order — each step feeds the next");
  await wait(page, LONG);

  await clearNarration(page);
  await wait(page, SHORT);
}
