import { test, expect, ALICE, TEST_NEO4J_BOLT_URL, TEST_PG_PORT } from "./fixtures";
import type { APIRequestContext } from "@playwright/test";

/** Delete a connection by name via API. Silently ignores if not found. */
async function deleteConnectionByName(request: APIRequestContext, name: string) {
  const res = await request.get("/api/connections");
  if (!res.ok()) return;
  const connections = (await res.json()) as { id: string; name: string }[];
  const match = connections.find((c) => c.name === name);
  if (match) {
    await request.delete(`/api/connections/${match.id}`);
  }
}

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
    const connName = `Test Neo4j ${Date.now()}`;
    try {
      await page.getByRole("button", { name: "Add Connection" }).click();
      const dialog = page.getByRole("dialog");
      // Step 1: type picker — choose Neo4j
      await dialog.getByTestId("pick-neo4j").click();
      // Step 2: fill the form
      await dialog.locator("#conn-name").fill(connName);
      await dialog.locator("#conn-uri").fill(TEST_NEO4J_BOLT_URL);
      await dialog.locator("#conn-username").fill("neo4j");
      await dialog.locator("#conn-password").fill("neoboard123");
      await dialog.getByRole("button", { name: "Create" }).click();

      await expect(page.getByText(connName)).toBeVisible();
    } finally {
      await deleteConnectionByName(page.request, connName);
    }
  });

  test("should create a PostgreSQL connection", async ({ page }) => {
    const connName = `Test PG ${Date.now()}`;
    try {
      await page.getByRole("button", { name: "Add Connection" }).click();
      const dialog = page.getByRole("dialog");
      // Step 1: type picker — choose PostgreSQL
      await dialog.getByTestId("pick-postgresql").click();
      // Step 2: fill the form
      await dialog.locator("#conn-name").fill(connName);
      await dialog.locator("#conn-uri").fill(`postgresql://localhost:${TEST_PG_PORT}`);
      await dialog.locator("#conn-username").fill("neoboard");
      await dialog.locator("#conn-password").fill("neoboard");
      await dialog.locator("#conn-database").fill("movies");
      await dialog.getByRole("button", { name: "Create" }).click();

      await expect(page.getByText(connName)).toBeVisible();
    } finally {
      await deleteConnectionByName(page.request, connName);
    }
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
    // Step 1: type picker
    await dialog.getByTestId("pick-neo4j").click();
    // Step 2: fill form (not actually creating, just testing inline)
    await dialog.locator("#conn-name").fill("Inline Test OK");
    await dialog.locator("#conn-uri").fill(TEST_NEO4J_BOLT_URL);
    await dialog.locator("#conn-username").fill("neo4j");
    await dialog.locator("#conn-password").fill("neoboard123");

    await dialog.getByRole("button", { name: "Test Connection" }).click();
    await expect(dialog.getByText("Connection successful!")).toBeVisible({
      timeout: 15_000,
    });
    // Close dialog without creating — no cleanup needed
  });

  test("should test inline connection before creating — failure shows error", async ({ page }) => {
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    // Step 1: type picker
    await dialog.getByTestId("pick-neo4j").click();
    // Step 2: fill form with bad credentials
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
    const connName = `Bad Creds ${Date.now()}`;
    try {
      // Create a connection with bad credentials
      await page.getByRole("button", { name: "Add Connection" }).click();
      const dialog = page.getByRole("dialog");
      // Step 1: type picker
      await dialog.getByTestId("pick-neo4j").click();
      // Step 2: fill form
      await dialog.locator("#conn-name").fill(connName);
      await dialog.locator("#conn-uri").fill("bolt://localhost:1");
      await dialog.locator("#conn-username").fill("wrong");
      await dialog.locator("#conn-password").fill("wrong");
      await dialog.getByRole("button", { name: "Create" }).click();
      await expect(dialog).not.toBeVisible();

      // Wait for auto-test to complete — should show "Error" badge
      await expect(page.getByText(connName).first()).toBeVisible();
      // The auto-test will run, resulting in an error status with error text visible
      const card = page.locator("div").filter({ hasText: connName }).first();
      await expect(card.getByText("Error")).toBeVisible({ timeout: 30_000 });
    } finally {
      await deleteConnectionByName(page.request, connName);
    }
  });

  test("should delete a connection with confirmation", async ({ page }) => {
    const connName = `To Delete ${Date.now()}`;
    // Create one first
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    // Step 1: type picker
    await dialog.getByTestId("pick-neo4j").click();
    // Step 2: fill form
    await dialog.locator("#conn-name").fill(connName);
    await dialog.locator("#conn-uri").fill(TEST_NEO4J_BOLT_URL);
    await dialog.locator("#conn-username").fill("neo4j");
    await dialog.locator("#conn-password").fill("neoboard123");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(connName)).toBeVisible();

    // Open the card's dropdown and click Delete
    const card = page.locator("div[class*='border']")
      .filter({ hasText: connName })
      .filter({ has: page.getByRole("button", { name: "Connection actions" }) });
    await card.getByRole("button", { name: "Connection actions" }).click();
    await page.getByRole("menuitem", { name: /Delete/ }).click();
    // Confirm deletion
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(connName)).not.toBeVisible();
    // No cleanup needed — the test itself deletes the connection
  });
});
