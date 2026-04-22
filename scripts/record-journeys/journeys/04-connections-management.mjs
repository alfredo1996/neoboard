/**
 * Journey 4: Connections Management
 *
 * Demonstrates: viewing connections, testing a connection, connection status.
 */
import { login } from "../helpers/login.mjs";
import { narrate, clearNarration } from "../helpers/narrate.mjs";
import { wait, SHORT, MEDIUM, LONG, HERO } from "../helpers/pace.mjs";

export const title = "Connections Management";

export async function run(page) {
  await login(page);

  await narrate(page, "Navigate to the Connections page");
  await page.getByRole("button", { name: "Connections" }).click();
  await wait(page, LONG);

  await narrate(page, "All database connections are listed with their status");
  await wait(page, HERO);

  await narrate(page, "Each connection shows its type (Neo4j or PostgreSQL) and health status");
  await wait(page, HERO);

  // Click the options menu on any connection card
  const menuButtons = page.getByRole("button", { name: /options/i });
  const menuCount = await menuButtons.count();
  if (menuCount > 0) {
    await narrate(page, "Open the connection options menu");
    await menuButtons.first().click();
    await wait(page, LONG);

    await narrate(page, "Options: edit settings, test connectivity, or delete");
    await wait(page, LONG);

    await page.keyboard.press("Escape");
    await wait(page, MEDIUM);
  }

  await narrate(page, "Connections can be tested, edited, and reassigned to other widgets");
  await wait(page, HERO);

  await clearNarration(page);
  await wait(page, SHORT);
}
