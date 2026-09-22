import {
  test,
  expect,
  ALICE,
  TEST_NEO4J_BOLT_URL,
  TEST_PG_PORT,
} from "./fixtures";

test.describe("Connection Advanced Settings", () => {
  test.beforeEach(async ({ authPage, sidebarPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await sidebarPage.navigateTo("Connections");
  });

  test("should expand and show Neo4j-specific advanced fields", async ({
    page,
  }) => {
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
    await expect(dialog.locator("#conn-max-pool-size")).toBeVisible();
    await expect(
      dialog.locator("#conn-connection-acquisition-timeout"),
    ).toBeVisible();

    // PG-only fields should NOT be visible
    await expect(dialog.locator("#conn-idle-timeout")).not.toBeVisible();
    await expect(dialog.locator("#conn-statement-timeout")).not.toBeVisible();
  });

  test("should expand and show PostgreSQL-specific advanced fields", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("pick-postgresql").click();

    // Expand
    await dialog.getByText("Advanced Settings").click();

    // PG fields should be visible
    await expect(dialog.locator("#conn-connection-timeout")).toBeVisible();
    await expect(dialog.locator("#conn-idle-timeout")).toBeVisible();
    await expect(dialog.locator("#conn-max-pool-size")).toBeVisible();
    await expect(dialog.locator("#conn-statement-timeout")).toBeVisible();
    await expect(dialog.locator("#conn-ssl-reject-unauthorized")).toBeVisible();

    // Neo4j-only fields should NOT be visible
    await expect(dialog.locator("#conn-query-timeout")).not.toBeVisible();
    await expect(
      dialog.locator("#conn-connection-acquisition-timeout"),
    ).not.toBeVisible();
  });

  test("should create Neo4j connection with custom timeout", async ({
    page,
  }) => {
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
    await dialog.locator("#conn-max-pool-size").fill("25");

    // Create
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });

  test("should create PostgreSQL connection with custom pool settings", async ({
    page,
  }) => {
    const name = `Adv PG ${Date.now()}`;
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("pick-postgresql").click();

    // Fill basic fields
    await dialog.locator("#conn-name").fill(name);
    await dialog
      .locator("#conn-uri")
      .fill(`postgresql://localhost:${TEST_PG_PORT}`);
    await dialog.locator("#conn-username").fill("neoboard");
    await dialog.locator("#conn-password").fill("neoboard");
    await dialog.locator("#conn-database").fill("movies");

    // Expand and fill advanced fields
    await dialog.getByText("Advanced Settings").click();
    await dialog.locator("#conn-max-pool-size").fill("20");
    await dialog.locator("#conn-idle-timeout").fill("30000");
    await dialog.locator("#conn-statement-timeout").fill("60000");

    // Create
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });

  test("should test inline connection with advanced settings", async ({
    page,
  }) => {
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

  test("footer stays in viewport with Advanced Settings expanded (#1041)", async ({
    page,
  }) => {
    // A short laptop viewport — the height where the tall dialog overflows.
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    // PostgreSQL has the tallest advanced section (incl. SSL + statement timeout)
    await dialog.getByTestId("pick-postgresql").click();
    await dialog.getByText("Advanced Settings").click();
    await expect(dialog.locator("#conn-statement-timeout")).toBeVisible();

    // The action buttons must be reachable WITHOUT scrolling the page: the
    // dialog body scrolls, the footer is pinned inside the viewport.
    await expect(
      dialog.getByRole("button", { name: "Create" }),
    ).toBeInViewport();
    await expect(
      dialog.getByRole("button", { name: "Test Connection" }),
    ).toBeInViewport();
    await expect(
      dialog.getByRole("button", { name: "Cancel" }),
    ).toBeInViewport();
  });

  // ───────────────────────────────────────────────────────────────────────
  // #1901 — create and edit are one form generated from the connector's
  // descriptor, and the server validates against the same descriptor.
  // ───────────────────────────────────────────────────────────────────────

  test("shows a descriptor constraint inline and saves nothing (#1901)", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Connection" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("pick-postgresql").click();

    await dialog.locator("#conn-name").fill(`Too Big ${Date.now()}`);
    await dialog
      .locator("#conn-uri")
      .fill(`postgresql://localhost:${TEST_PG_PORT}`);
    await dialog.locator("#conn-username").fill("neoboard");
    await dialog.locator("#conn-password").fill("neoboard");
    await dialog.getByText("Advanced Settings").click();
    await dialog.locator("#conn-max-pool-size").fill("500");
    await dialog.getByRole("button", { name: "Create" }).click();

    await expect(dialog.locator("#conn-max-pool-size-error")).toHaveText(
      "Max Pool Size must be at most 100",
    );
    await expect(dialog).toBeVisible();
  });

  test("the edit dialog is the same generated form, and a blank password keeps the stored one (#1901)", async ({
    page,
  }) => {
    const name = `Edit Generated ${Date.now()}`;
    const created = await page.request.post("/api/connections", {
      data: {
        name,
        type: "postgresql",
        config: {
          uri: `postgresql://localhost:${TEST_PG_PORT}`,
          username: "neoboard",
          password: "neoboard",
          database: "movies",
          maxPoolSize: 20,
          statementTimeout: 60000,
          maxRows: 2000,
        },
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const id = (await created.json()).data.id as string;

    try {
      await page.reload();
      const card = page
        .locator("div[class*='border']")
        .filter({ hasText: name })
        .filter({
          has: page.getByRole("button", { name: "Connection actions" }),
        });
      await card.getByRole("button", { name: "Connection actions" }).click();
      await page.getByRole("menuitem", { name: /Edit/ }).click();

      // Pre-filled from the stored config, under edit- ids derived from the
      // same keys; the advanced section starts open.
      const dialog = page.getByRole("dialog");
      await expect(dialog.locator("#edit-max-pool-size")).toHaveValue("20");
      await expect(dialog.locator("#edit-statement-timeout")).toHaveValue(
        "60000",
      );
      await expect(dialog.locator("#edit-max-rows")).toHaveValue("2000");
      await expect(dialog.locator("#edit-database")).toHaveValue("movies");
      await expect(
        dialog.locator("#edit-ssl-reject-unauthorized"),
      ).toBeVisible();
      // This connector declares no query or acquisition timeout.
      await expect(dialog.locator("#edit-query-timeout")).toHaveCount(0);
      await expect(
        dialog.locator("#edit-connection-acquisition-timeout"),
      ).toHaveCount(0);
      // The secret never comes back, and says what leaving it blank does.
      await expect(dialog.locator("#edit-password")).toHaveValue("");
      await expect(dialog.locator("#edit-password")).toHaveAttribute(
        "placeholder",
        "Leave blank to keep existing",
      );

      await dialog.locator("#edit-max-pool-size").fill("30");
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(
        page.getByText("Connection updated", { exact: true }),
      ).toBeVisible({ timeout: 10_000 });

      // The change is stored, the secret is not handed out…
      const stored = await page.request.get(`/api/connections/${id}`);
      const config = (await stored.json()).data.config;
      expect(config.maxPoolSize).toBe(30);
      expect(config.statementTimeout).toBe(60000);
      expect(config).not.toHaveProperty("password");
      // …and it is still the one that was stored: the connection dials.
      const probe = await page.request.post(`/api/connections/${id}/test`);
      expect((await probe.json()).data.success).toBe(true);
    } finally {
      await page.request.delete(`/api/connections/${id}?force=true`);
    }
  });

  test("the API validates against the descriptor: per-field 400, undeclared keys dropped (#1901)", async ({
    page,
  }) => {
    const base = {
      uri: `postgresql://localhost:${TEST_PG_PORT}`,
      username: "neoboard",
      password: "neoboard",
    };
    const rejected = await page.request.post("/api/connections", {
      data: {
        name: `Rejected ${Date.now()}`,
        type: "postgresql",
        config: { ...base, maxPoolSize: 500, uri: "bolt://localhost:7687" },
      },
    });
    expect(rejected.status()).toBe(400);
    const { error } = await rejected.json();
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(error.details.fields).sort()).toEqual([
      "maxPoolSize",
      "uri",
    ]);

    const created = await page.request.post("/api/connections", {
      data: {
        name: `Stripped ${Date.now()}`,
        type: "postgresql",
        // queryTimeout belongs to another connector; nobody declares `note`.
        config: { ...base, queryTimeout: 5000, note: "dropped" },
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const id = (await created.json()).data.id as string;
    try {
      const stored = await page.request.get(`/api/connections/${id}`);
      expect((await stored.json()).data.config).toEqual({
        uri: base.uri,
        username: base.username,
      });
    } finally {
      await page.request.delete(`/api/connections/${id}?force=true`);
    }
  });
});
