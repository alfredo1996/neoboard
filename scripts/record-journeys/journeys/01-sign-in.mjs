/**
 * Journey 1: Sign in to NeoBoard
 *
 * Demonstrates: login form, credential entry, dashboard landing.
 */
import { narrate, clearNarration } from "../helpers/narrate.mjs";
import { wait, SHORT, MEDIUM, LONG, HERO } from "../helpers/pace.mjs";

export const title = "Sign In";

export async function run(page) {
  await page.goto("http://localhost:3000/login");
  await wait(page, MEDIUM);

  await narrate(page, "Welcome to NeoBoard — sign in with your credentials");
  await wait(page, LONG);

  await narrate(page, "Enter your email address");
  await page.getByRole("textbox", { name: "Email" }).fill("admin@neoboard.local");
  await wait(page, MEDIUM);

  await narrate(page, "Enter your password");
  await page.getByRole("textbox", { name: "Password" }).fill("admin123");
  await wait(page, MEDIUM);

  await narrate(page, 'Click "Sign in"');
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/", { timeout: 10_000 });
  await wait(page, MEDIUM);

  await narrate(page, "You're in! The dashboard list shows all your dashboards");
  await wait(page, HERO);

  await clearNarration(page);
  await wait(page, SHORT);
}
