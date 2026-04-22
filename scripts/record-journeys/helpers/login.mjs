/**
 * Shared sign-in flow for all journeys.
 */
import { narrate } from "./narrate.mjs";
import { wait, MEDIUM, SHORT } from "./pace.mjs";

export async function login(
  page,
  { email = "admin@neoboard.local", password = "admin123" } = {},
) {
  await page.goto("http://localhost:3000/login");
  await wait(page, SHORT);
  await narrate(page, "Signing in to NeoBoard");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await wait(page, SHORT);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/", { timeout: 10_000 });
  await wait(page, MEDIUM);
}
