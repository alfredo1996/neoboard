/**
 * Journey 11: Dashboard Import & Export
 *
 * Demonstrates: exporting a dashboard as JSON, the import flow.
 */
import { login } from "../helpers/login.mjs";
import { narrate, clearNarration } from "../helpers/narrate.mjs";
import { wait, SHORT, MEDIUM, LONG, HERO } from "../helpers/pace.mjs";

export const title = "Dashboard Import & Export";

export async function run(page) {
  await login(page);

  // Open an existing dashboard
  await narrate(page, "Open a dashboard to export it");
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

  // Click the menu on the dashboard
  await narrate(page, "Click the dashboard options menu");
  const optionsButton = page.getByRole("button", { name: /Dashboard options/i });
  if (await optionsButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await optionsButton.click();
    await wait(page, MEDIUM);

    await narrate(page, "Export as JSON — portable dashboard definition with all widgets and settings");
    await wait(page, LONG);

    await page.keyboard.press("Escape");
    await wait(page, MEDIUM);
  }

  // Go back to dashboard list and show the import button
  await page.getByRole("button", { name: "Back" }).click();
  await wait(page, LONG);

  await narrate(page, 'Back on the dashboard list — click "Import" to load a JSON file');
  await wait(page, LONG);

  await narrate(page, "Import maps portable connection keys to your real connections");
  await wait(page, HERO);

  await clearNarration(page);
  await wait(page, SHORT);
}
