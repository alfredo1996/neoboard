/**
 * Journey 10: Admin — Users & Settings
 *
 * Demonstrates: user management page, settings page, API keys.
 */
import { login } from "../helpers/login.mjs";
import { narrate, clearNarration } from "../helpers/narrate.mjs";
import { wait, SHORT, MEDIUM, LONG, HERO } from "../helpers/pace.mjs";

export const title = "Admin — Users & Settings";

export async function run(page) {
  await login(page);

  // Users page
  await narrate(page, "Admin view: manage users in your organization");
  await page.getByRole("button", { name: "Users" }).click();
  await wait(page, HERO);

  await narrate(page, "View all users, their roles, and creation dates");
  await wait(page, LONG);

  // Settings page
  await narrate(page, "Open Settings for profile and API key management");
  await page.getByRole("button", { name: "Settings" }).click();
  await wait(page, HERO);

  await narrate(page, "Settings: update your profile, manage API keys for programmatic access");
  await wait(page, LONG);

  // Navigate to API keys if there's a tab/link
  const apiKeysLink = page.getByRole("link", { name: /API/i }).first();
  if (await apiKeysLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    await apiKeysLink.click();
    await wait(page, LONG);
    await narrate(page, "API keys enable headless access — dashboards, connections, and queries via REST");
    await wait(page, HERO);
  }

  await narrate(page, "NeoBoard's REST API supports all management operations");
  await wait(page, LONG);

  await clearNarration(page);
  await wait(page, SHORT);
}
