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
    const name = `Test Neo4j ${Date.now()}`;
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    // Step 1: type picker — choose Neo4j
    await dialog.getByTestId("pick-neo4j").click();
    // Step 2: fill the form
    await dialog.locator("#conn-name").fill(name);
    await dialog.locator("#conn-uri").fill(TEST_NEO4J_BOLT_URL);
    await dialog.locator("#conn-username").fill("neo4j");
    await dialog.locator("#conn-password").fill("neoboard123");
    await dialog.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText(name)).toBeVisible();
  });

  test("should create a PostgreSQL connection", async ({ page }) => {
    const name = `Test PG ${Date.now()}`;
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    // Step 1: type picker — choose PostgreSQL
    await dialog.getByTestId("pick-postgresql").click();
    // Step 2: fill the form
    await dialog.locator("#conn-name").fill(name);
    await dialog.locator("#conn-uri").fill(`postgresql://localhost:${TEST_PG_PORT}`);
    await dialog.locator("#conn-username").fill("neoboard");
    await dialog.locator("#conn-password").fill("neoboard");
    await dialog.locator("#conn-database").fill("movies");
    await dialog.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText(name)).toBeVisible();
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
    const name = `Inline OK ${Date.now()}`;
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    // Step 1: type picker
    await dialog.getByTestId("pick-neo4j").click();
    // Step 2: fill form
    await dialog.locator("#conn-name").fill(name);
    await dialog.locator("#conn-uri").fill(TEST_NEO4J_BOLT_URL);
    await dialog.locator("#conn-username").fill("neo4j");
    await dialog.locator("#conn-password").fill("neoboard123");

    await dialog.getByRole("button", { name: "Test Connection" }).click();
    await expect(dialog.getByText("Connection successful!")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("should test inline connection before creating — failure shows error", async ({ page }) => {
    const name = `Inline Fail ${Date.now()}`;
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    // Step 1: type picker
    await dialog.getByTestId("pick-neo4j").click();
    // Step 2: fill form with bad credentials
    await dialog.locator("#conn-name").fill(name);
    await dialog.locator("#conn-uri").fill("bolt://localhost:1");
    await dialog.locator("#conn-username").fill("wrong");
    await dialog.locator("#conn-password").fill("wrong");

    await dialog.getByRole("button", { name: "Test Connection" }).click();
    // Should show a destructive alert — scope to the AlertDescription to avoid multiple matches
    await expect(dialog.locator('[role="alert"]').getByText(/failed|error|refused|ECONNREFUSED/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("should show error status text on failed connection test", async ({ page }) => {
    const name = `Bad Creds ${Date.now()}`;
    // Create a connection with bad credentials
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    // Step 1: type picker
    await dialog.getByTestId("pick-neo4j").click();
    // Step 2: fill form
    await dialog.locator("#conn-name").fill(name);
    await dialog.locator("#conn-uri").fill("bolt://localhost:1");
    await dialog.locator("#conn-username").fill("wrong");
    await dialog.locator("#conn-password").fill("wrong");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).not.toBeVisible();

    // Wait for auto-test to complete — should show "Error" badge on the card
    await expect(page.getByText(name).first()).toBeVisible();
    // Use the card heading to locate the specific card, then find "Error" badge within it
    const card = page.locator("div").filter({ has: page.getByText(name, { exact: true }) }).first();
    await expect(card.getByText("Error").first()).toBeVisible({ timeout: 30_000 });
  });

  test("should duplicate a connection via card dropdown", async ({ page }) => {
    // Open the first connection card's dropdown menu
    const firstActions = page.getByRole("button", { name: "Connection actions" }).first();
    await expect(firstActions).toBeVisible({ timeout: 10_000 });
    await firstActions.click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();

    // The create dialog should open with the name pre-filled with "(copy)"
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const nameInput = dialog.locator("#conn-name");
    await expect(nameInput).toBeVisible();
    const nameValue = await nameInput.inputValue();
    expect(nameValue).toContain("(copy)");
  });

  test("should delete a connection with confirmation", async ({ page }) => {
    const name = `To Delete ${Date.now()}`;
    // Create one first
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    // Step 1: type picker
    await dialog.getByTestId("pick-neo4j").click();
    // Step 2: fill form
    await dialog.locator("#conn-name").fill(name);
    await dialog.locator("#conn-uri").fill(TEST_NEO4J_BOLT_URL);
    await dialog.locator("#conn-username").fill("neo4j");
    await dialog.locator("#conn-password").fill("neoboard123");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(name)).toBeVisible();

    // Open the card's dropdown and click Delete
    const card = page.locator("div[class*='border']")
      .filter({ hasText: name })
      .filter({ has: page.getByRole("button", { name: "Connection actions" }) });
    await card.getByRole("button", { name: "Connection actions" }).click();
    await page.getByRole("menuitem", { name: /Delete/ }).click();
    // Confirm deletion
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(name)).not.toBeVisible();
  });
});
