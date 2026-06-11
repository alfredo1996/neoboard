import { test, expect, ALICE, BOB } from "./fixtures";

/**
 * Connection visibility model (#901) — "admin provisions, all use".
 *
 * ALICE (admin) owns the seeded connections; BOB (creator) starts with no
 * connections of his own. Sharing a connection makes it queryable and
 * visible tenant-wide, read-only for non-owners; making it private again
 * drops BOB back to the dashboard-bound fallback (#972).
 *
 * Serial: the tests walk one share/unshare lifecycle on conn-pg-001 and
 * restore the private state at the end so other specs see the seed state.
 */
test.describe.serial("Connection sharing (#901)", () => {
  const PG_CONNECTION_ID = "conn-pg-001";
  const PG_CONNECTION_NAME = "Movies DB (PostgreSQL)";

  test("creator does not see another user's private connection", async ({
    authPage,
    page,
  }) => {
    await authPage.login(BOB.email, BOB.password);
    await page.goto("/connections");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(PG_CONNECTION_NAME)).not.toBeVisible();
  });

  test("admin shares a connection with the workspace", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.goto("/connections");
    // Scope to the single card element (established pattern from
    // connections.spec — bare div filters match every ancestor).
    const card = page
      .locator("div[class*='border']")
      .filter({ hasText: PG_CONNECTION_NAME })
      .filter({
        has: page.getByRole("button", { name: "Connection actions" }),
      });
    await card.getByRole("button", { name: "Connection actions" }).click();
    await page.getByRole("menuitem", { name: "Share with workspace" }).click();
    await expect(card.getByText("Shared", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("creator sees the shared connection read-only and can query it", async ({
    authPage,
    page,
  }) => {
    await authPage.login(BOB.email, BOB.password);
    await page.goto("/connections");
    await expect(page.getByText(PG_CONNECTION_NAME)).toBeVisible();
    await expect(
      page.getByText("Shared", { exact: true }).first(),
    ).toBeVisible();
    // No management menu at all for non-owners: every action is gated.
    // (BOB owns nothing, so no card on the page has an actions menu.)
    await expect(
      page.getByRole("button", { name: "Connection actions" }),
    ).not.toBeVisible();

    // Direct query through the shared connection — the #901 fast path.
    const res = await page.request.post("/api/query", {
      data: { connectionId: PG_CONNECTION_ID, query: "SELECT 1 AS ok" },
    });
    expect(res.status()).toBe(200);
  });

  test("creator cannot change visibility (admin-only)", async ({
    authPage,
    page,
  }) => {
    await authPage.login(BOB.email, BOB.password);
    const res = await page.request.patch(
      `/api/connections/${PG_CONNECTION_ID}`,
      { data: { visibility: "private" } },
    );
    expect(res.status()).toBe(403);
  });

  test("admin makes it private again; creator loses direct access", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const patch = await page.request.patch(
      `/api/connections/${PG_CONNECTION_ID}`,
      { data: { visibility: "private" } },
    );
    expect(patch.ok()).toBeTruthy();

    await authPage.logout();
    await authPage.login(BOB.email, BOB.password);
    // Arbitrary direct queries now fall back to dashboard-bound access:
    // public dashboards reference this connection, but "SELECT 1 AS ok"
    // is not one of their saved queries -> 403 (#972).
    const res = await page.request.post("/api/query", {
      data: { connectionId: PG_CONNECTION_ID, query: "SELECT 1 AS ok" },
    });
    expect(res.status()).toBe(403);
  });
});
