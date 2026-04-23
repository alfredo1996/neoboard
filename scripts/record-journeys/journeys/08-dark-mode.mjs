/**
 * Journey 8: Dark Mode Toggle
 *
 * Demonstrates: theme switching, chart adaptation, sidebar theming.
 */
import { login } from "../helpers/login.mjs";
import { narrate, clearNarration } from "../helpers/narrate.mjs";
import { wait, SHORT, MEDIUM, LONG, HERO } from "../helpers/pace.mjs";
import { scrollToFirstChart, scrollToTop } from "../helpers/scroll.mjs";

export const title = "Dark Mode";

export async function run(page) {
  await login(page);

  await narrate(page, "NeoBoard supports light and dark themes");
  await wait(page, LONG);

  // Open Chart Gallery for visual impact
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

  // Show a chart in light mode first
  await page.getByRole("tab", { name: "1. Bar" }).click();
  await wait(page, LONG);
  await scrollToFirstChart(page);
  await wait(page, LONG);

  await narrate(page, "Light mode — clean, bright backgrounds");
  await wait(page, LONG);

  // Switch to dark
  await scrollToTop(page);
  await wait(page, SHORT);
  await narrate(page, "Toggle dark mode from the sidebar");
  await page.getByRole("button", { name: "Theme" }).click();
  await wait(page, SHORT);
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await wait(page, LONG);

  await narrate(page, "Dark mode — charts adapt automatically");
  await scrollToFirstChart(page);
  await wait(page, HERO);

  // Show gauge in dark
  await scrollToTop(page);
  await wait(page, SHORT);
  await page.getByRole("tab", { name: "6. Gauge" }).click();
  await wait(page, LONG);
  await scrollToFirstChart(page);
  await wait(page, HERO);

  await narrate(page, "Gauge in dark mode — ticks and labels now theme-aware");
  await wait(page, LONG);

  // Show treemap in dark
  await scrollToTop(page);
  await wait(page, SHORT);
  await page.getByRole("tab", { name: "15. Treemap" }).click();
  await wait(page, LONG);
  await scrollToFirstChart(page);
  await wait(page, HERO);

  await narrate(page, "Treemap — neutral borders, no white-on-dark clash");
  await wait(page, LONG);

  // Switch back to light
  await scrollToTop(page);
  await wait(page, SHORT);
  await narrate(page, "Switch back — instant transition");
  await page.getByRole("button", { name: "Theme" }).click();
  await wait(page, SHORT);
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await wait(page, LONG);

  await narrate(page, "Theme preference is persisted across sessions");
  await wait(page, LONG);

  await clearNarration(page);
  await wait(page, SHORT);
}
