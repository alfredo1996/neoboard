/**
 * Journey 9: Widget Lab
 *
 * Demonstrates: browsing templates, searching, filtering by chart type.
 */
import { login } from "../helpers/login.mjs";
import { narrate, clearNarration } from "../helpers/narrate.mjs";
import { wait, SHORT, MEDIUM, LONG, HERO } from "../helpers/pace.mjs";

export const title = "Widget Lab — Reusable Templates";

export async function run(page) {
  await login(page);

  await narrate(page, "Open the Widget Lab — a library of reusable widget templates");
  await page.getByRole("button", { name: "Widget Lab" }).click();
  await wait(page, HERO);

  await narrate(page, "Browse all available templates with preview queries");
  await wait(page, LONG);

  // Scroll through templates
  await page.evaluate(() => window.scrollTo({ top: 300, behavior: "smooth" }));
  await wait(page, LONG);

  await page.evaluate(() => window.scrollTo({ top: 600, behavior: "smooth" }));
  await wait(page, LONG);

  // Search
  await narrate(page, "Search templates by name");
  const searchBox = page.getByPlaceholder(/search/i).first();
  if (await searchBox.isVisible({ timeout: 2000 }).catch(() => false)) {
    await searchBox.fill("bar");
    await wait(page, LONG);

    await narrate(page, 'Filtered to templates matching "bar"');
    await wait(page, LONG);

    await searchBox.clear();
    await wait(page, MEDIUM);
  }

  await narrate(page, "Templates can be consumed from the widget editor when adding a new widget");
  await wait(page, LONG);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await wait(page, MEDIUM);

  await clearNarration(page);
  await wait(page, SHORT);
}
