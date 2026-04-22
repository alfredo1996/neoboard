/**
 * Journey 8: Dark Mode Toggle
 *
 * Demonstrates: theme switching, chart adaptation, sidebar theming.
 */
import { login } from "../helpers/login.mjs";
import { narrate, clearNarration } from "../helpers/narrate.mjs";
import { wait, SHORT, MEDIUM, LONG, HERO } from "../helpers/pace.mjs";

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

  // Show a chart in light mode
  await page.getByRole("tab", { name: "6. Gauge" }).click();
  await wait(page, MEDIUM);
  await page.evaluate(() => window.scrollTo({ top: 350, behavior: "smooth" }));
  await wait(page, LONG);

  await narrate(page, "Light mode — the default. Clean, bright backgrounds");
  await wait(page, LONG);

  // Switch to dark
  await narrate(page, "Toggle dark mode from the sidebar");
  await page.getByRole("button", { name: "Theme" }).click();
  await wait(page, SHORT);
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await wait(page, LONG);

  await narrate(page, "Dark mode — all charts adapt automatically. Labels, ticks, grids are theme-aware");
  await wait(page, HERO);

  // Show another chart type in dark
  await page.getByRole("tab", { name: "17. Radar" }).click();
  await wait(page, MEDIUM);
  await page.evaluate(() => window.scrollTo({ top: 350, behavior: "smooth" }));
  await wait(page, HERO);

  await page.getByRole("tab", { name: "15. Treemap" }).click();
  await wait(page, MEDIUM);
  await page.evaluate(() => window.scrollTo({ top: 350, behavior: "smooth" }));
  await wait(page, HERO);

  // Switch back to light
  await narrate(page, "Switch back to light mode — instant transition");
  await page.getByRole("button", { name: "Theme" }).click();
  await wait(page, SHORT);
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await wait(page, LONG);

  await narrate(page, "Theme preference is persisted across sessions");
  await wait(page, LONG);

  await clearNarration(page);
  await wait(page, SHORT);
}
