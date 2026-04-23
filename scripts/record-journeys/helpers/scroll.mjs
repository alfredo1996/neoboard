/**
 * Scroll helpers for journey recordings.
 */

/**
 * Scroll to the first chart widget on the page — skips the markdown
 * description block and puts the actual chart in view.
 */
export async function scrollToFirstChart(page) {
  await page.evaluate(() => {
    const chart =
      document.querySelector("[data-testid='base-chart']") ??
      document.querySelector("canvas");
    if (chart) {
      const top = chart.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: "smooth" });
    } else {
      // Fallback: scroll past the markdown (~450px)
      window.scrollTo({ top: 450, behavior: "smooth" });
    }
  });
}

/**
 * Scroll to show the full page from top (toolbar + tabs visible).
 */
export async function scrollToTop(page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
}
