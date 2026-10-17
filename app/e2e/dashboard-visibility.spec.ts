import { test, expect, ALICE, BOB, uid } from "./fixtures";

test.describe("Dashboard visibility — public/private", () => {
  test("new creator user sees public dashboards without explicit sharing", async ({
    authPage,
    page,
  }) => {
    // Sign up a fresh user — they have no shares or owned dashboards
    const email = `visibility-${uid()}@example.com`;
    await authPage.signup("Visibility Test User", email, "password123");
    await expect(page).toHaveURL("/", { timeout: 15_000 });

    // Should see "Movie Analytics" (public, owned by Alice)
    await expect(
      page.getByText("Movie Analytics", { exact: true }),
    ).toBeVisible({
      timeout: 10_000,
    });

    // Should NOT see "Actor Network" (private, owned by Bob, no share)
    await expect(page.getByText("Actor Network")).not.toBeVisible();
  });

  test("public dashboard row carries a Public tag", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);

    // "Movie Analytics" is public — its row should carry a Public tag
    const publicCard = page
      .getByRole("row")
      .filter({ has: page.getByText("Movie Analytics", { exact: true }) })
      .first();
    await expect(publicCard).toBeVisible({ timeout: 10_000 });
    await expect(publicCard.getByText("Public", { exact: true })).toBeVisible();
  });

  test("private dashboard row has no Public tag", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);

    // "Actor Network" is private — no Public tag
    const privateCard = page
      .getByRole("row")
      .filter({ hasText: "Actor Network" })
      .first();
    await expect(privateCard).toBeVisible({ timeout: 10_000 });
    await expect(
      privateCard.getByText("Public", { exact: true }),
    ).not.toBeVisible();
  });

  test("new creator user can view public dashboard in read-only mode", async ({
    authPage,
    page,
  }) => {
    // Sign up a fresh user with no shares
    const email = `viewer-${uid()}@example.com`;
    await authPage.signup("Viewer Test User", email, "password123");
    await expect(page).toHaveURL("/", { timeout: 15_000 });

    // Click on the public dashboard
    await page.getByText("Movie Analytics", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // Should see the dashboard name
    await expect(
      page.getByText("Movie Analytics", { exact: true }).first(),
    ).toBeVisible();

    // As a viewer (not owner/editor), the Edit button should not be visible
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).not.toBeVisible();
  });

  test("sharing panel shows public toggle for admin", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);

    // Navigate to Movie Analytics edit page
    await page.getByText("Movie Analytics", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.waitForURL(/\/edit/, { timeout: 15_000 });

    // Open the Sharing panel
    await page.getByRole("button", { name: "Sharing" }).click();

    // Should see the public access toggle
    await expect(page.getByText("Public access")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText("Anyone in the organization can view this dashboard"),
    ).toBeVisible();

    // The toggle should exist (Movie Analytics is public, so it should be checked)
    const toggle = page.locator("#public-toggle");
    await expect(toggle).toBeVisible();

    // Should also see the "People" section
    await expect(page.getByText("People")).toBeVisible();
  });

  test("bob (creator) sees public dashboard with viewer role badge", async ({
    authPage,
    page,
  }) => {
    await authPage.login(BOB.email, BOB.password);

    // Bob should see "Movie Analytics" — shared with him as viewer AND it's public
    const publicCard = page
      .getByRole("row")
      .filter({ has: page.getByText("Movie Analytics", { exact: true }) })
      .first();
    await expect(publicCard).toBeVisible({ timeout: 10_000 });

    // Bob should also see his own "Actor Network" dashboard
    await expect(page.getByText("Actor Network")).toBeVisible();
  });
});
