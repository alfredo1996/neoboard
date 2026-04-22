/**
 * Journey 5: Rule-Based Styling demo dashboard
 *
 * Demonstrates: conditional colors on charts based on data thresholds.
 */
import { login } from "../helpers/login.mjs";
import { narrate, clearNarration } from "../helpers/narrate.mjs";
import { wait, SHORT, MEDIUM, LONG, HERO } from "../helpers/pace.mjs";

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

  await narrate(page, "Charts use conditional colors — values above/below thresholds get different colors");
  await page.evaluate(() => window.scrollTo({ top: 350, behavior: "smooth" }));
  await wait(page, HERO);

  await narrate(page, "Rules can target bar color, text color, or background");
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: "smooth" }));
  await wait(page, HERO);

  // Visit a few tabs if they exist
  const tabs = await page.getByRole("tab").all();
  if (tabs.length > 2) {
    await narrate(page, "Each chart type has its own styling rules page");
    await tabs[1].click();
    await wait(page, MEDIUM);
    await page.evaluate(() => window.scrollTo({ top: 350, behavior: "smooth" }));
    await wait(page, HERO);

    await tabs[2].click();
    await wait(page, MEDIUM);
    await page.evaluate(() => window.scrollTo({ top: 350, behavior: "smooth" }));
    await wait(page, HERO);
  }

  await narrate(page, "Styling rules are set per-widget in the widget editor");
  await wait(page, LONG);

  await clearNarration(page);
  await wait(page, SHORT);
}
