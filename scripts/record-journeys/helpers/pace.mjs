/**
 * Pacing helpers — deliberate delays so recorded videos are watchable.
 */

/** Short pause between micro-actions (typing, clicking). */
export const SHORT = 800;

/** Medium pause — let the viewer register a result. */
export const MEDIUM = 1500;

/** Long pause — important outcome on screen. */
export const LONG = 2500;

/** Extra long — hero moment (chart renders, dashboard loads). */
export const HERO = 3500;

/** Wait for a fixed duration. */
export async function wait(page, ms = MEDIUM) {
  await page.waitForTimeout(ms);
}
