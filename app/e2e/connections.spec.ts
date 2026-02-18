import { test, expect, ALICE, TEST_NEO4J_BOLT_URL, TEST_PG_PORT } from "./fixtures";

test.describe("Connections", () => {
  test.beforeEach(async ({ authPage, sidebarPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await sidebarPage.navigateTo("Connections");
  });

  test("should auto-check connection status on load", async ({ page }) => {
    // Seeded connections should start auto-testing (show "connecting" then resolve)
    await expect(page.getByText(/connected|error/i).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("should create a new Neo4j connection", async ({ page }) => {
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#conn-name").fill("Test Neo4j");
    await dialog.locator("#conn-uri").fill(TEST_NEO4J_BOLT_URL);
    await dialog.locator("#conn-username").fill("neo4j");
    await dialog.locator("#conn-password").fill("neoboard123");
    await dialog.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText("Test Neo4j")).toBeVisible();
  });

  test("should create a PostgreSQL connection", async ({ page }) => {
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#conn-name").fill("Test PG");
    // Switch type to postgresql
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "PostgreSQL" }).click();
    await dialog.locator("#conn-uri").fill(`postgresql://localhost:${TEST_PG_PORT}`);
    await dialog.locator("#conn-username").fill("neoboard");
    await dialog.locator("#conn-password").fill("neoboard");
    await dialog.locator("#conn-database").fill("movies");
    await dialog.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText("Test PG")).toBeVisible();
  });

  test("should manually test a connection", async ({ page }) => {
    // Open the first connection card's dropdown menu
    const firstActions = page.getByRole("button", { name: "Connection actions" }).first();
    await expect(firstActions).toBeVisible({ timeout: 10000 });
    await firstActions.click();
    await page.getByRole("menuitem", { name: /Test Connection/ }).click();
    // Should show connected or error
    await expect(page.getByText(/connected|error/i).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("should test inline connection before creating — success", async ({ page }) => {
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#conn-name").fill("Inline Test OK");
    await dialog.locator("#conn-uri").fill(TEST_NEO4J_BOLT_URL);
    await dialog.locator("#conn-username").fill("neo4j");
    await dialog.locator("#conn-password").fill("neoboard123");

    await dialog.getByRole("button", { name: "Test Connection" }).click();
    await expect(dialog.getByText("Connection successful!")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("should test inline connection before creating — failure shows error", async ({ page }) => {
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#conn-name").fill("Inline Test Fail");
    await dialog.locator("#conn-uri").fill("bolt://localhost:1");
    await dialog.locator("#conn-username").fill("wrong");
    await dialog.locator("#conn-password").fill("wrong");

    await dialog.getByRole("button", { name: "Test Connection" }).click();
    // Should NOT show success
    await expect(dialog.getByText("Connection successful!")).not.toBeVisible({
      timeout: 15_000,
    });
    // Should show a destructive alert with error text
    await expect(dialog.getByText(/failed|error|refused|ECONNREFUSED/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("should show error status text on failed connection test", async ({ page }) => {
    // Create a connection with bad credentials
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#conn-name").fill("Bad Creds");
    await dialog.locator("#conn-uri").fill("bolt://localhost:1");
    await dialog.locator("#conn-username").fill("wrong");
    await dialog.locator("#conn-password").fill("wrong");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).not.toBeVisible();

    // Wait for auto-test to complete — should show "Error" badge
    await expect(page.getByText("Bad Creds")).toBeVisible();
    // The auto-test will run, resulting in an error status with error text visible
    const card = page.locator("div").filter({ hasText: "Bad Creds" }).first();
    await expect(card.getByText("Error")).toBeVisible({ timeout: 30_000 });
  });

  test("should delete a connection with confirmation", async ({ page }) => {
    // Create one first
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#conn-name").fill("To Delete");
    await dialog.locator("#conn-uri").fill(TEST_NEO4J_BOLT_URL);
    await dialog.locator("#conn-username").fill("neo4j");
    await dialog.locator("#conn-password").fill("neoboard123");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("To Delete")).toBeVisible();

    // Open the card's dropdown and click Delete
    const card = page.locator("div[class*='border']")
      .filter({ hasText: "To Delete" })
      .filter({ has: page.getByRole("button", { name: "Connection actions" }) });
    await card.getByRole("button", { name: "Connection actions" }).click();
    await page.getByRole("menuitem", { name: /Delete/ }).click();
    // Confirm deletion
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("To Delete")).not.toBeVisible();
  });
});
