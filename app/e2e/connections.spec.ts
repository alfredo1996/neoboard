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
  // Delete connection in use — issue #481
  // ─────────────────────────────────────────────────────────────────────────
  //
  // The delete flow currently has NO server-side guard against deleting a
  // connection that is referenced by dashboard widgets. These tests pin the
  // current behavior so the post-guard fix is explicitly visible:
  //
  //   1. The confirm dialog warns with generic copy ("widgets will stop
  //      working") but does not show the usage count. Follow-up issue #TBD.
  //   2. The DELETE /api/connections/{id} route returns 200 with no conflict
  //      check — orphaned widgets are left to degrade gracefully. Follow-up
  //      issue #TBD.
  //   3. No re-assign flow exists in the UI. Follow-up issue #TBD.
  //
  // When the guard lands, flip test 2's status assertion from 200 to 409 and
  // add an assertion that the connection still exists until the user force-
  // confirms.

  test("deleting a connection in use leaves widget in a graceful degraded state", async ({
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

    // 2. Create a dashboard that uses this connection via a simple table widget.
    const dashRes = await page.request.post("/api/dashboards", {
      data: { name: `inuse-dash ${Date.now()}` },
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
                  settings: { title: "Orphaned-candidate widget" },
                },
              ],
              gridLayout: [{ i: "w1", x: 0, y: 0, w: 12, h: 6 }],
            },
          ],
        },
      },
    });
    expect(putRes.ok()).toBeTruthy();

    try {
      // 3. Go to the connections page and locate the new card.
      await page.reload();
      const card = page
        .locator("div[class*='border']")
        .filter({ hasText: connName })
        .filter({
          has: page.getByRole("button", { name: "Connection actions" }),
        });
      await expect(card).toBeVisible({ timeout: 10_000 });

      // 4. Open the dropdown and click Delete.
      await card.getByRole("button", { name: "Connection actions" }).click();
      await page.getByRole("menuitem", { name: /Delete/ }).click();

      // 5. Assert the confirm dialog shows the generic in-use warning.
      //    Current copy: "Any widgets using it will stop working."
      //    Loose regex so minor copy tweaks don't break the test.
      await expect(
        page.getByText(/widgets.*stop working|break|stop functioning/i),
      ).toBeVisible({ timeout: 5_000 });

      // 6. Confirm delete.
      await page.getByRole("button", { name: "Delete" }).click();
      await expect(page.getByText(connName)).not.toBeVisible({
        timeout: 10_000,
      });

      // 7. Navigate to the dashboard and verify the widget still renders
      //    some graceful state. The exact text is intentionally not pinned —
      //    we only assert (a) the card container for the widget is visible
      //    (no React error boundary fallback) and (b) the widget title is
      //    still there. The specific error copy is a separate concern and
      //    may evolve; a regex-based "error"/"not found"/"failed" match is
      //    enough to prove the widget didn't crash.
      await page.goto(`/${dashId}`);
      await expect(page.getByText("Orphaned-candidate widget")).toBeVisible({
        timeout: 15_000,
      });
      // The widget must not render a hard crash — React error boundaries
      // show "Something went wrong" or similar.
      await expect(
        page.getByText(/something went wrong|uncaught|error boundary/i),
      ).not.toBeVisible();
    } finally {
      // Best-effort cleanup — dashboard delete cascades nothing (widgets
      // live in layoutJson), and the connection is already gone.
      await page.request
        .delete(`/api/dashboards/${dashId}`)
        .catch(() => undefined);
    }
  });

  test("DELETE /api/connections/{id} silently removes an in-use connection (pins current no-guard behavior)", async ({
    page,
  }) => {
    // This test documents the current API behavior: no conflict check when
    // the connection is referenced by a widget. When the guard lands
    // (follow-up issue #TBD), change the expected status from 200 to 409
    // and add an assertion that the connection still exists after the
    // attempted delete.
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
      // Direct DELETE — no guard, returns 200.
      const delRes = await page.request.delete(`/api/connections/${connId}`);
      expect(delRes.status()).toBe(200);

      // Confirm the connection is really gone.
      const listRes = await page.request.get("/api/connections?limit=100");
      expect(listRes.status()).toBe(200);
      const listBody = await listRes.json();
      const ids = ((listBody.data ?? []) as Array<{ id: string }>).map(
        (c) => c.id,
      );
      expect(ids).not.toContain(connId);

      // Dashboard layoutJson still references the orphaned connectionId —
      // verify the widget's query endpoint now returns 404 "Connection not
      // found" when fired against the deleted id.
      const queryRes = await page.request.post("/api/query", {
        data: { connectionId: connId, query: "SELECT 1" },
      });
      expect(queryRes.status()).toBe(404);
      const queryBody = await queryRes.json();
      expect(queryBody.error?.message).toMatch(/connection not found/i);
    } finally {
      await page.request
        .delete(`/api/dashboards/${dashId}`)
        .catch(() => undefined);
    }
  });
});
