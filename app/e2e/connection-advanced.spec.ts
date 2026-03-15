import { test, expect, ALICE, TEST_NEO4J_BOLT_URL, TEST_PG_PORT } from "./fixtures";

test.describe("Connection Advanced Settings", () => {
  test.beforeEach(async ({ authPage, sidebarPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await sidebarPage.navigateTo("Connections");
  });

  test("should expand and show Neo4j-specific advanced fields", async ({ page }) => {
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("pick-neo4j").click();

    // Advanced section should be collapsed by default
    await expect(dialog.getByText("Advanced Settings")).toBeVisible();
    await expect(dialog.locator("#conn-connection-timeout")).not.toBeVisible();

    // Expand
    await dialog.getByText("Advanced Settings").click();

    // Neo4j fields should be visible
    await expect(dialog.locator("#conn-connection-timeout")).toBeVisible();
    await expect(dialog.locator("#conn-query-timeout")).toBeVisible();
    await expect(dialog.locator("#conn-max-pool")).toBeVisible();
    await expect(dialog.locator("#conn-acquisition-timeout")).toBeVisible();

    // PG-only fields should NOT be visible
    await expect(dialog.locator("#conn-idle-timeout")).not.toBeVisible();
    await expect(dialog.locator("#conn-statement-timeout")).not.toBeVisible();
  });

  test("should expand and show PostgreSQL-specific advanced fields", async ({ page }) => {
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("pick-postgresql").click();

    // Expand
    await dialog.getByText("Advanced Settings").click();

    // PG fields should be visible
    await expect(dialog.locator("#conn-connection-timeout")).toBeVisible();
    await expect(dialog.locator("#conn-idle-timeout")).toBeVisible();
    await expect(dialog.locator("#conn-max-pool")).toBeVisible();
    await expect(dialog.locator("#conn-statement-timeout")).toBeVisible();
    await expect(dialog.locator("#conn-ssl-reject")).toBeVisible();

    // Neo4j-only fields should NOT be visible
    await expect(dialog.locator("#conn-query-timeout")).not.toBeVisible();
    await expect(dialog.locator("#conn-acquisition-timeout")).not.toBeVisible();
  });

  test("should create Neo4j connection with custom timeout", async ({ page }) => {
    const name = `Adv Neo4j ${Date.now()}`;
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("pick-neo4j").click();

    // Fill basic fields
    await dialog.locator("#conn-name").fill(name);
    await dialog.locator("#conn-uri").fill(TEST_NEO4J_BOLT_URL);
    await dialog.locator("#conn-username").fill("neo4j");
    await dialog.locator("#conn-password").fill("neoboard123");

    // Expand and fill advanced fields
    await dialog.getByText("Advanced Settings").click();
    await dialog.locator("#conn-connection-timeout").fill("15000");
    await dialog.locator("#conn-max-pool").fill("25");

    // Create
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });

  test("should create PostgreSQL connection with custom pool settings", async ({ page }) => {
    const name = `Adv PG ${Date.now()}`;
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("pick-postgresql").click();

    // Fill basic fields
    await dialog.locator("#conn-name").fill(name);
    await dialog.locator("#conn-uri").fill(`postgresql://localhost:${TEST_PG_PORT}`);
    await dialog.locator("#conn-username").fill("neoboard");
    await dialog.locator("#conn-password").fill("neoboard");
    await dialog.locator("#conn-database").fill("movies");

    // Expand and fill advanced fields
    await dialog.getByText("Advanced Settings").click();
    await dialog.locator("#conn-max-pool").fill("20");
    await dialog.locator("#conn-idle-timeout").fill("30000");
    await dialog.locator("#conn-statement-timeout").fill("60000");

    // Create
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });

  test("should test inline connection with advanced settings", async ({ page }) => {
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("pick-neo4j").click();

    // Fill form
    await dialog.locator("#conn-name").fill(`Inline Adv ${Date.now()}`);
    await dialog.locator("#conn-uri").fill(TEST_NEO4J_BOLT_URL);
    await dialog.locator("#conn-username").fill("neo4j");
    await dialog.locator("#conn-password").fill("neoboard123");

    // Expand and fill advanced timeout
    await dialog.getByText("Advanced Settings").click();
    await dialog.locator("#conn-connection-timeout").fill("60000");

    // Test inline — should succeed even with custom timeout
    await dialog.getByRole("button", { name: "Test Connection" }).click();
    await expect(dialog.getByText("Connection successful!")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("should collapse advanced settings on toggle", async ({ page }) => {
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("pick-neo4j").click();

    // Expand
    await dialog.getByText("Advanced Settings").click();
    await expect(dialog.locator("#conn-connection-timeout")).toBeVisible();

    // Collapse
    await dialog.getByText("Advanced Settings").click();
    await expect(dialog.locator("#conn-connection-timeout")).not.toBeVisible();
  });
});
