import {
  test,
  expect,
  ALICE,
  TEST_NEO4J_BOLT_URL,
  TEST_PG_PORT,
} from "./fixtures";

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
    await dialog
      .locator("#conn-uri")
      .fill(`postgresql://localhost:${TEST_PG_PORT}`);
    await dialog.locator("#conn-username").fill("neoboard");
    await dialog.locator("#conn-password").fill("neoboard");
    await dialog.locator("#conn-database").fill("movies");
    await dialog.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText(name)).toBeVisible();
  });

  test("should manually test a connection", async ({ page }) => {
    // Open the first connection card's dropdown menu
    const firstActions = page
      .getByRole("button", { name: "Connection actions" })
      .first();
    await expect(firstActions).toBeVisible({ timeout: 10000 });
    await firstActions.click();
    await page.getByRole("menuitem", { name: /Test Connection/ }).click();
    // Should show connected or error
    await expect(page.getByText(/connected|error/i).first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("should test inline connection before creating — success", async ({
    page,
  }) => {
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

  test("should test inline connection before creating — failure shows error", async ({
    page,
  }) => {
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
    await expect(
      dialog
        .locator('[role="alert"]')
        .getByText(/failed|error|refused|ECONNREFUSED/i)
        .first(),
    ).toBeVisible({
      timeout: 30_000,
    });
  });

  test("should show error status text on failed connection test", async ({
    page,
  }) => {
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
    const card = page
      .locator("div")
      .filter({ has: page.getByText(name, { exact: true }) })
      .first();
    await expect(card.getByText("Error").first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("should duplicate a connection via card dropdown", async ({ page }) => {
    // Open the first connection card's dropdown menu
    const firstActions = page
      .getByRole("button", { name: "Connection actions" })
      .first();
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

  test("clicking an error card shows error details inline", async ({
    page,
  }) => {
    // Use the first seeded connection which should be in error state
    // (seeded with localhost URIs that don't work from the test server)
    const firstCard = page.locator("[class*='cursor-pointer']").first();
    await expect(firstCard.getByText("Error").first()).toBeVisible({
      timeout: 30_000,
    });

    // Click the card — should expand an inline alert with the error message
    await firstCard.click();
    // The alert is rendered as a sibling inside the same wrapper div
    const wrapper = firstCard.locator("..");
    await expect(wrapper.locator('[role="alert"]')).toBeVisible({
      timeout: 5_000,
    });

    // Click again to collapse
    await firstCard.click();
    await expect(wrapper.locator('[role="alert"]')).not.toBeVisible();
  });

  test("should pre-fill edit dialog with existing connection values", async ({
    page,
  }) => {
    // Wait for seeded connections to load
    const firstActions = page
      .getByRole("button", { name: "Connection actions" })
      .first();
    await expect(firstActions).toBeVisible({ timeout: 10000 });

    // Open the kebab menu on the first connection and click Edit
    await firstActions.click();
    await page.getByRole("menuitem", { name: /Edit/ }).click();

    // Assert the edit dialog opens
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Assert URI and username fields are pre-filled (not empty)
    const uriInput = dialog.locator("#edit-uri");
    const usernameInput = dialog.locator("#edit-username");
    await expect(uriInput).not.toHaveValue("", { timeout: 5000 });
    await expect(usernameInput).not.toHaveValue("");

    // Close dialog
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible();
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
    const card = page
      .locator("div[class*='border']")
      .filter({ hasText: name })
      .filter({
        has: page.getByRole("button", { name: "Connection actions" }),
      });
    await card.getByRole("button", { name: "Connection actions" }).click();
    await page.getByRole("menuitem", { name: /Delete/ }).click();
    // Confirm deletion
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(name)).not.toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Delete connection in use — issues #481 / #508 / #509
  // ─────────────────────────────────────────────────────────────────────────
  //
  // After #509 lands, the delete flow has a real server-side guard:
  //
  //   1. The confirm dialog pre-fetches GET /api/connections/{id}/usage and
  //      renders a breakdown of N widgets on M dashboards. Button label
  //      switches to "Delete anyway" when the connection is in use.
  //   2. DELETE /api/connections/{id} returns 409 Conflict when the
  //      connection has referencing widgets and `?force=true` is not set,
  //      with the usage breakdown in error.details.usage.
  //   3. DELETE /api/connections/{id}?force=true bypasses the guard so the
  //      "Delete anyway" button (and CLI/automation) can still proceed.
  //
  // The tests below cover the API and UI sides of all three.

  test("delete confirm dialog renders usage breakdown and proceeds on 'Delete anyway'", async ({
    page,
  }) => {
    // 1. Create a fresh PG connection via API so we don't step on the seeded
    //    conn-pg-001 (other tests depend on it).
    const connName = `inuse-ui-${Date.now()}`;
    const createRes = await page.request.post("/api/connections", {
      data: {
        name: connName,
        type: "postgresql",
        config: {
          uri: `postgresql://localhost:${TEST_PG_PORT}`,
          username: "neoboard",
          password: "neoboard",
          database: "movies",
        },
      },
    });
    expect(createRes.status()).toBe(201);
    const connId = (await createRes.json()).data.id as string;

    // 2. Create a dashboard that uses this connection via 2 widgets so we
    //    can assert the usage count isn't 1.
    const dashName = `inuse-dash ${Date.now()}`;
    const dashRes = await page.request.post("/api/dashboards", {
      data: { name: dashName },
    });
    const dashId = (await dashRes.json()).data.id as string;
    const putRes = await page.request.put(`/api/dashboards/${dashId}`, {
      data: {
        layoutJson: {
          version: 2 as const,
          pages: [
            {
              id: "page-1",
              title: "Main",
              widgets: [
                {
                  id: "w1",
                  chartType: "table",
                  connectionId: connId,
                  query: "SELECT 1 AS n",
                  settings: { title: "Widget 1" },
                },
                {
                  id: "w2",
                  chartType: "single-value",
                  connectionId: connId,
                  query: "SELECT 42 AS answer",
                  settings: { title: "Widget 2" },
                },
              ],
              gridLayout: [
                { i: "w1", x: 0, y: 0, w: 6, h: 4 },
                { i: "w2", x: 6, y: 0, w: 6, h: 4 },
              ],
            },
          ],
        },
      },
    });
    expect(putRes.ok()).toBeTruthy();

    try {
      // 3. GET /api/connections/{id}/usage — returns the breakdown before
      //    the user ever opens the dialog.
      const usageRes = await page.request.get(
        `/api/connections/${connId}/usage`,
      );
      expect(usageRes.status()).toBe(200);
      const usageBody = await usageRes.json();
      expect(usageBody.data.widgetCount).toBe(2);
      expect(usageBody.data.dashboards).toHaveLength(1);
      expect(usageBody.data.dashboards[0].name).toBe(dashName);
      expect(usageBody.data.dashboards[0].widgetCount).toBe(2);

      // 4. Navigate to the connections page and locate the card.
      await page.reload();
      const card = page
        .locator("div[class*='border']")
        .filter({ hasText: connName })
        .filter({
          has: page.getByRole("button", { name: "Connection actions" }),
        });
      await expect(card).toBeVisible({ timeout: 10_000 });

      // 5. Open the dropdown and click Delete.
      await card.getByRole("button", { name: "Connection actions" }).click();
      await page.getByRole("menuitem", { name: /Delete/ }).click();

      // 6. Assert the confirm dialog shows the usage breakdown: widget
      //    count, dashboard count, and the dashboard name in the bulleted
      //    list. Use regex so minor copy tweaks don't break the test.
      await expect(page.getByText(/2 widgets.*1 dashboard/i)).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText(dashName)).toBeVisible();

      // 7. The button label must be "Delete anyway", not the default "Delete".
      await expect(
        page.getByRole("button", { name: "Delete anyway" }),
      ).toBeVisible();

      // 8. Confirm delete — UI passes ?force=true under the hood.
      await page.getByRole("button", { name: "Delete anyway" }).click();
      await expect(page.getByText(connName)).not.toBeVisible({
        timeout: 10_000,
      });

      // 9. Navigate to the dashboard and verify the widget still renders
      //    some graceful state — same assertion as before #509 since the
      //    orphaned-widget behavior hasn't changed.
      await page.goto(`/${dashId}`);
      await expect(page.getByText("Widget 1")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.getByText(/something went wrong|uncaught|error boundary/i),
      ).not.toBeVisible();
    } finally {
      await page.request
        .delete(`/api/dashboards/${dashId}`)
        .catch(() => undefined);
    }
  });

  test("DELETE /api/connections/{id} returns 409 CONFLICT when in use; ?force=true bypasses the guard", async ({
    page,
  }) => {
    const connName = `inuse-api-${Date.now()}`;
    const createRes = await page.request.post("/api/connections", {
      data: {
        name: connName,
        type: "postgresql",
        config: {
          uri: `postgresql://localhost:${TEST_PG_PORT}`,
          username: "neoboard",
          password: "neoboard",
          database: "movies",
        },
      },
    });
    expect(createRes.status()).toBe(201);
    const connId = (await createRes.json()).data.id as string;

    const dashRes = await page.request.post("/api/dashboards", {
      data: { name: `inuse-api-dash ${Date.now()}` },
    });
    const dashId = (await dashRes.json()).data.id as string;
    await page.request.put(`/api/dashboards/${dashId}`, {
      data: {
        layoutJson: {
          version: 2 as const,
          pages: [
            {
              id: "page-1",
              title: "Main",
              widgets: [
                {
                  id: "w1",
                  chartType: "table",
                  connectionId: connId,
                  query: "SELECT 1",
                  settings: { title: "API orphan candidate" },
                },
              ],
              gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 6 }],
            },
          ],
        },
      },
    });

    try {
      // Direct DELETE WITHOUT force → 409 Conflict with the usage shape.
      const delRes = await page.request.delete(`/api/connections/${connId}`);
      expect(delRes.status()).toBe(409);
      const delBody = await delRes.json();
      expect(delBody.error?.code).toBe("CONFLICT");
      expect(delBody.error?.message).toMatch(/1 widget across 1 dashboard/i);
      expect(delBody.error?.details?.usage?.widgetCount).toBe(1);
      expect(delBody.error?.details?.usage?.dashboards).toHaveLength(1);

      // Connection must still exist after the failed delete.
      const stillThereRes = await page.request.get(
        `/api/connections/${connId}`,
      );
      expect(stillThereRes.status()).toBe(200);

      // Force delete → 200 and the connection is gone.
      const forceRes = await page.request.delete(
        `/api/connections/${connId}?force=true`,
      );
      expect(forceRes.status()).toBe(200);
      const forceBody = await forceRes.json();
      expect(forceBody.data?.deleted).toBe(true);

      // Confirm the connection is really gone from the list.
      const listRes = await page.request.get("/api/connections?limit=100");
      const listBody = await listRes.json();
      const ids = ((listBody.data ?? []) as Array<{ id: string }>).map(
        (c) => c.id,
      );
      expect(ids).not.toContain(connId);

      // The orphaned widget's subsequent /api/query call must return 404
      // "Connection not found" — the downstream degradation path from the
      // original #481 test.
      const queryRes = await page.request.post("/api/query", {
        data: { connectionId: connId, query: "SELECT 1" },
      });
      expect(queryRes.status()).toBe(404);
      expect((await queryRes.json()).error?.message).toMatch(
        /connection not found/i,
      );
    } finally {
      await page.request
        .delete(`/api/dashboards/${dashId}`)
        .catch(() => undefined);
    }
  });
});
