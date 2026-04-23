/**
 * Journey 0: Full NeoBoard Tour — single continuous video
 *
 * Combines all user journeys into one recording for end-to-end review.
 */
import { narrate, clearNarration } from "../helpers/narrate.mjs";
import { wait, SHORT, MEDIUM, LONG, HERO } from "../helpers/pace.mjs";
import { scrollToFirstChart, scrollToTop } from "../helpers/scroll.mjs";

export const title = "NeoBoard — Full Tour";

// ─── Helpers ────────────────────────────────────────────────────────

async function openDashboard(page, name) {
  await page.evaluate((n) => {
    const cards = document.querySelectorAll('[class*="cursor-pointer"]');
    for (const c of cards) {
      if (c.textContent?.includes(n)) { c.click(); return; }
    }
  }, name);
  await wait(page, HERO);
}

async function goHome(page) {
  await page.goto("http://localhost:3000");
  await wait(page, LONG);
}

// ─── Tour ───────────────────────────────────────────────────────────

export async function run(page) {
  // ── 1. SIGN IN ────────────────────────────────────────────────────
  await page.goto("http://localhost:3000/login");
  await wait(page, MEDIUM);

  await narrate(page, "1/11  Sign In");
  await wait(page, MEDIUM);
  await page.getByRole("textbox", { name: "Email" }).fill("admin@neoboard.local");
  await page.getByRole("textbox", { name: "Password" }).fill("admin123");
  await wait(page, SHORT);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/", { timeout: 10_000 });
  await wait(page, LONG);

  await narrate(page, "Dashboard list — all your dashboards at a glance");
  await wait(page, HERO);

  // ── 2. CONNECTIONS ────────────────────────────────────────────────
  await narrate(page, "2/11  Connections");
  await page.getByRole("button", { name: "Connections" }).click();
  await wait(page, HERO);

  await narrate(page, "4 database connections — Neo4j and PostgreSQL");
  await wait(page, HERO);

  // ── 3. CREATE DASHBOARD + BAR CHART ───────────────────────────────
  await page.getByRole("button", { name: "Dashboards" }).click();
  await wait(page, LONG);

  await narrate(page, "3/11  Create a Dashboard + Bar Chart");
  await page.getByRole("button", { name: "New Dashboard" }).click();
  await wait(page, MEDIUM);

  const createDialog = page.getByRole("dialog");
  await createDialog.getByRole("textbox", { name: "Name" }).fill("Revenue Report");
  await wait(page, SHORT);
  await createDialog.getByRole("button", { name: "Create" }).click();
  await page.waitForURL("**/edit**", { timeout: 10_000 });
  await wait(page, LONG);

  await narrate(page, "Add a widget — select connection, write a query");
  await page.getByRole("button", { name: "Add Widget" }).first().click();
  await wait(page, MEDIUM);

  const widgetDialog = page.getByRole("dialog", { name: "Add Widget" });
  await widgetDialog.getByRole("combobox").first().click();
  await wait(page, SHORT);
  await page.getByRole("option", { name: /Ecommerce.*read/i }).click();
  await wait(page, MEDIUM);

  const editor = widgetDialog.locator(".cm-editor .cm-content");
  await editor.click();
  await wait(page, SHORT);

  const queryLines = [
    "SELECT c.name AS category,",
    "       SUM(oi.qty * oi.price) AS revenue",
    "FROM categories c",
    "JOIN products p ON p.category_id = c.id",
    "JOIN order_items oi ON oi.product_id = p.id",
    "WHERE c.parent_id IS NOT NULL",
    "GROUP BY c.name",
    "ORDER BY revenue DESC",
  ];
  for (const line of queryLines) {
    await page.keyboard.type(line, { delay: 4 });
    await page.keyboard.press("Enter");
  }
  await wait(page, MEDIUM);

  await narrate(page, "Run the query — chart preview renders instantly");
  await widgetDialog.getByTitle(/Run query/).click();
  await wait(page, HERO);

  await narrate(page, "Save the widget");
  await widgetDialog.getByRole("button", { name: "Add Widget" }).click();
  await wait(page, HERO);

  await narrate(page, "Bar chart is live on the dashboard!");
  await wait(page, HERO);

  // Navigate back to dashboard list
  await page.goto("http://localhost:3000");
  await wait(page, LONG);

  // ── 4. CHART GALLERY TOUR ─────────────────────────────────────────
  await narrate(page, "4/11  Chart Gallery — 17 chart types");
  await openDashboard(page, "Chart Gallery");

  const chartTabs = [
    { name: "1. Bar", desc: "Bar chart" },
    { name: "2. Line", desc: "Line chart" },
    { name: "3. Pie / Donut", desc: "Pie & Donut" },
    { name: "6. Gauge", desc: "Gauge" },
    { name: "14. Sankey", desc: "Sankey" },
    { name: "15. Treemap", desc: "Treemap" },
    { name: "16. Sunburst", desc: "Sunburst" },
    { name: "17. Radar", desc: "Radar" },
  ];

  for (const tab of chartTabs) {
    await narrate(page, tab.desc);
    await page.getByRole("tab", { name: tab.name }).click();
    await wait(page, LONG);
    await scrollToFirstChart(page);
    await wait(page, LONG);
    await scrollToTop(page);
    await wait(page, SHORT);
  }

  await goHome(page);

  // ── 5. STYLING RULES ──────────────────────────────────────────────
  await narrate(page, "5/11  Rule-Based Styling — conditional colors");
  await openDashboard(page, "Rule-Based Styling");
  await wait(page, LONG);

  await scrollToFirstChart(page);
  await wait(page, HERO);

  const stylingTabs = await page.getByRole("tab").all();
  if (stylingTabs.length > 1) {
    await scrollToTop(page);
    await wait(page, SHORT);
    await stylingTabs[1].click();
    await wait(page, LONG);
    await scrollToFirstChart(page);
    await wait(page, HERO);
  }
  if (stylingTabs.length > 2) {
    await scrollToTop(page);
    await wait(page, SHORT);
    await stylingTabs[2].click();
    await wait(page, LONG);
    await scrollToFirstChart(page);
    await wait(page, HERO);
  }

  await goHome(page);

  // ── 6. CLICK ACTIONS ──────────────────────────────────────────────
  await narrate(page, "6/11  Click Actions — interactive filtering");
  await openDashboard(page, "Click Actions");
  await wait(page, LONG);

  await scrollToFirstChart(page);
  await wait(page, HERO);

  const canvas = page.locator("canvas").first();
  if (await canvas.isVisible({ timeout: 3000 }).catch(() => false)) {
    await narrate(page, "Click a bar to set a parameter");
    const box = await canvas.boundingBox();
    if (box) {
      await canvas.click({ position: { x: box.width * 0.15, y: box.height * 0.3 } });
      await wait(page, HERO);
    }
  }

  await scrollToTop(page);
  await wait(page, MEDIUM);

  const clickTabs = await page.getByRole("tab").all();
  if (clickTabs.length > 1) {
    await clickTabs[1].click();
    await wait(page, LONG);
    await scrollToFirstChart(page);
    await wait(page, LONG);
  }

  await goHome(page);

  // ── 7. TRANSFORMATIONS ────────────────────────────────────────────
  await narrate(page, "7/11  Data Transformations — filter, sort, group");
  await openDashboard(page, "Transformations");
  await wait(page, LONG);

  const transformTabs = await page.getByRole("tab").all();
  const transformNames = ["Filter", "Sort", "Group By"];
  for (let i = 0; i < Math.min(transformTabs.length, 3); i++) {
    await narrate(page, transformNames[i] ?? `Transform ${i + 1}`);
    await transformTabs[i].click();
    await wait(page, LONG);
    await scrollToFirstChart(page);
    await wait(page, LONG);
    await scrollToTop(page);
    await wait(page, SHORT);
  }

  await goHome(page);

  // ── 8. DARK MODE ──────────────────────────────────────────────────
  await narrate(page, "8/11  Dark Mode");
  await openDashboard(page, "Chart Gallery");
  await page.getByRole("tab", { name: "1. Bar" }).click();
  await wait(page, LONG);
  await scrollToFirstChart(page);
  await wait(page, LONG);

  await scrollToTop(page);
  await wait(page, SHORT);
  await page.getByRole("button", { name: "Theme" }).click();
  await wait(page, SHORT);
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await wait(page, LONG);

  await narrate(page, "Dark mode — all charts adapt");
  await scrollToFirstChart(page);
  await wait(page, HERO);

  await scrollToTop(page);
  await wait(page, SHORT);
  await page.getByRole("tab", { name: "6. Gauge" }).click();
  await wait(page, LONG);
  await scrollToFirstChart(page);
  await wait(page, HERO);

  // Switch back
  await scrollToTop(page);
  await wait(page, SHORT);
  await page.getByRole("button", { name: "Theme" }).click();
  await wait(page, SHORT);
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await wait(page, LONG);

  await goHome(page);

  // ── 9. WIDGET LAB ─────────────────────────────────────────────────
  await narrate(page, "9/11  Widget Lab — reusable templates");
  await page.getByRole("button", { name: "Widget Lab" }).click();
  await wait(page, HERO);

  await page.evaluate(() => window.scrollTo({ top: 300, behavior: "smooth" }));
  await wait(page, LONG);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await wait(page, MEDIUM);

  // ── 10. ADMIN ─────────────────────────────────────────────────────
  await narrate(page, "10/11  Admin — Users & Settings");
  await page.getByRole("button", { name: "Users" }).click();
  await wait(page, HERO);

  await page.getByRole("button", { name: "Settings" }).click();
  await wait(page, HERO);

  const apiLink = page.getByRole("link", { name: /API/i }).first();
  if (await apiLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    await apiLink.click();
    await wait(page, LONG);
    await narrate(page, "API keys for programmatic access");
    await wait(page, LONG);
  }

  // ── 11. IMPORT / EXPORT ───────────────────────────────────────────
  await narrate(page, "11/11  Import & Export");
  await page.getByRole("button", { name: "Dashboards" }).click();
  await wait(page, LONG);

  await narrate(page, "Import button loads a JSON dashboard definition");
  await wait(page, LONG);

  await narrate(page, "Export from any dashboard's options menu");
  await wait(page, LONG);

  // ── OUTRO ─────────────────────────────────────────────────────────
  await narrate(page, "That's NeoBoard — dashboards for Neo4j + PostgreSQL");
  await wait(page, HERO);

  await clearNarration(page);
  await wait(page, MEDIUM);
}
