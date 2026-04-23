/**
 * Journey 2: Create a dashboard and add a bar chart widget
 *
 * Demonstrates: dashboard creation, widget editor, query execution, preview.
 */
import { login } from "../helpers/login.mjs";
import { narrate, clearNarration } from "../helpers/narrate.mjs";
import { wait, SHORT, MEDIUM, LONG, HERO } from "../helpers/pace.mjs";

export const title = "Create Dashboard + Bar Chart";

export async function run(page) {
  await login(page);

  // Create dashboard
  await narrate(page, "Creating a new dashboard");
  await page.getByRole("button", { name: "New Dashboard" }).click();
  await wait(page, MEDIUM);

  const dialog = page.getByRole("dialog");
  await narrate(page, 'Give it a name — "Sales Overview"');
  await dialog.getByRole("textbox", { name: "Name" }).fill("Sales Overview");
  await wait(page, SHORT);

  await dialog.getByRole("button", { name: "Create" }).click();
  await page.waitForURL("**/edit**", { timeout: 10_000 });
  await wait(page, LONG);

  await narrate(page, "You're in the dashboard editor — click Add Widget");
  await wait(page, MEDIUM);

  await page.getByRole("button", { name: "Add Widget" }).first().click();
  await wait(page, MEDIUM);

  const widgetDialog = page.getByRole("dialog", { name: "Add Widget" });

  // Select the PostgreSQL Ecommerce connection
  await narrate(page, "Pick the PostgreSQL Ecommerce connection");
  await widgetDialog.getByRole("combobox").first().click();
  await wait(page, SHORT);
  await page.getByRole("option", { name: /Ecommerce.*read/i }).click();
  await wait(page, MEDIUM);

  // Type a query
  await narrate(page, "Write a SQL query to fetch revenue by category");
  await wait(page, MEDIUM);

  // The query editor is a CodeMirror instance — type into it
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
    await page.keyboard.type(line, { delay: 6 });
    await page.keyboard.press("Enter");
  }
  await wait(page, MEDIUM);

  // Run the preview
  await narrate(page, "Run the query to see the chart preview");
  await widgetDialog.getByTitle(/Run query/).click();
  await wait(page, HERO);

  // Save
  await narrate(page, "Looks good — save the widget");
  await widgetDialog.getByRole("button", { name: "Add Widget" }).click();
  await wait(page, LONG);

  await narrate(page, "The bar chart is now on the dashboard!");
  await wait(page, HERO);

  await clearNarration(page);
  await wait(page, SHORT);
}
