import { test, expect, ALICE, CAROL, uid } from "./fixtures";
import { AuthPage } from "./pages/auth";

/**
 * Wait for the users table to have loaded at least one data row.
 *
 * Deterministic replacement for the old "alice@example.com visible" gate:
 * the list is newest-first with a 20-row page, so under full-run concurrency
 * (other specs create users) seeded alice can legitimately sit on page 2 —
 * her absence from page 1 is not a load failure (#1004).
 */
async function waitForUsersTable(page: import("@playwright/test").Page) {
  await expect(page.getByRole("row").nth(1)).toBeVisible({ timeout: 10_000 });
}

/**
 * Find a user's row through the search box: the list holds 20 users to a page
 * and concurrent specs create newer ones (#1004, #2254).
 */
async function filterToUser(
  page: import("@playwright/test").Page,
  email: string,
) {
  await waitForUsersTable(page);
  await page.getByPlaceholder("Search users...").fill(email);
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toBeVisible({ timeout: 10_000 });
  return row;
}

/** A row's "⋯" button, opened. */
async function openMenu(row: import("@playwright/test").Locator) {
  await row.getByRole("button", { name: /^User actions for / }).click();
}

test.describe("User management", () => {
  test.beforeEach(async ({ authPage, sidebarPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await sidebarPage.navigateTo("Users");
  });

  test("should show users page with current users", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: "Users" }),
    ).toBeVisible();
    // Should show at least the seeded users (filter — alice may be on a
    // later page when concurrent specs have created many newer users, #1004)
    await filterToUser(page, "alice@example.com");
  });

  test("should create a new user", async ({ page }) => {
    // Wait for user data to load (avoids duplicate "Create User" buttons from EmptyState)
    await waitForUsersTable(page);
    await page.getByRole("button", { name: "Create user" }).first().click();
    const dialog = page.getByRole("dialog");
    const timestamp = uid();
    await dialog.locator("#user-name").fill("Test User");
    await dialog.locator("#user-email").fill(`test-${timestamp}@example.com`);
    await dialog.locator("#user-password").fill("password123");
    await dialog.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText(`test-${timestamp}@example.com`)).toBeVisible();
  });

  test("should change a user's role from the row menu", async ({ page }) => {
    // Wait for user data to load
    await waitForUsersTable(page);
    // Create a fresh user as "creator"
    await page.getByRole("button", { name: "Create user" }).first().click();
    const dialog = page.getByRole("dialog");
    const timestamp = uid();
    const email = `test-role-${timestamp}@example.com`;
    await dialog.locator("#user-name").fill("Role Test User");
    await dialog.locator("#user-email").fill(email);
    await dialog.locator("#user-password").fill("password123");
    // Creator is the default role — no change needed
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(email)).toBeVisible({ timeout: 10000 });

    // Find the user's row and change the role from its menu
    const row = await filterToUser(page, email);
    await expect(row.getByText("Creator", { exact: true })).toBeVisible();
    await openMenu(row);
    await page.getByRole("menuitem", { name: "Make reader" }).click();

    // Assert toast "Role updated" appears (use exact match to avoid strict-mode
    // violation from the aria-live status announcement that also contains "Role updated")
    await expect(page.getByText("Role updated", { exact: true })).toBeVisible({
      timeout: 5000,
    });

    // Verify the role changed — the row now reads "Reader"
    await expect(row.getByText("Reader", { exact: true })).toBeVisible();
  });

  test("should delete a user with confirmation", async ({ page }) => {
    // Wait for user data to load
    await waitForUsersTable(page);
    // Create a user to delete
    await page.getByRole("button", { name: "Create user" }).first().click();
    const dialog = page.getByRole("dialog");
    const timestamp = uid();
    const email = `delete-${timestamp}@example.com`;
    await dialog.locator("#user-name").fill("To Delete");
    await dialog.locator("#user-email").fill(email);
    await dialog.locator("#user-password").fill("password123");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(email)).toBeVisible();

    // Find the row and open actions dropdown, then click Delete
    const row = page.getByRole("row").filter({ hasText: email });
    await row.getByRole("button", { name: "User actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    // Confirm deletion in the confirm dialog
    await page.getByRole("button", { name: "Delete" }).last().click();
    await expect(page.getByText(email)).not.toBeVisible();
  });
});

test.describe("Force password change", () => {
  test.beforeEach(async ({ authPage, sidebarPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await sidebarPage.navigateTo("Users");
  });

  test("should create user with require password change checkbox", async ({
    page,
  }) => {
    await waitForUsersTable(page);
    await page.getByRole("button", { name: "Create user" }).first().click();
    const dialog = page.getByRole("dialog");
    const timestamp = uid();
    const email = `force-pw-${timestamp}@example.com`;
    await dialog.locator("#user-name").fill("Force PW User");
    await dialog.locator("#user-email").fill(email);
    await dialog.locator("#user-password").fill("password123");
    // Check the require password change checkbox
    await dialog.locator("#user-force-password-change").click();
    await dialog.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText(email)).toBeVisible();
  });

  test("admin can trigger require password change from dropdown", async ({
    page,
  }) => {
    // Create a user first
    await waitForUsersTable(page);
    await page.getByRole("button", { name: "Create user" }).first().click();
    const dialog = page.getByRole("dialog");
    const timestamp = uid();
    const email = `reset-pw-${timestamp}@example.com`;
    await dialog.locator("#user-name").fill("Reset PW User");
    await dialog.locator("#user-email").fill(email);
    await dialog.locator("#user-password").fill("password123");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(email)).toBeVisible();

    // Open actions dropdown and click Require Password Change
    const row = page.getByRole("row").filter({ hasText: email });
    await row.getByRole("button", { name: "User actions" }).click();
    await page
      .getByRole("menuitem", { name: "Require Password Change" })
      .click();

    // Should show temp password dialog with copy button
    const tempDialog = page.getByRole("dialog", { name: "Temporary Password" });
    await expect(tempDialog).toBeVisible({ timeout: 10_000 });
    await expect(
      tempDialog.getByText("temporary password has been generated"),
    ).toBeVisible();
    await expect(tempDialog.locator("code")).toBeVisible();
    await expect(
      tempDialog.getByRole("button", { name: /copy/i }),
    ).toBeVisible();
    await tempDialog.getByRole("button", { name: "Done" }).click();
  });
});

test.describe("write access, from the row menu", () => {
  /** Helper: create a fresh creator user and return their email. */
  async function createCreator(
    page: import("@playwright/test").Page,
    label: string,
  ) {
    const email = `${label}-${uid()}@example.com`;
    await waitForUsersTable(page);
    await page.getByRole("button", { name: "Create user" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#user-name").fill("Test Creator");
    await dialog.locator("#user-email").fill(email);
    await dialog.locator("#user-password").fill("password123");
    // Creator is the default role — no change needed
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(email)).toBeVisible({ timeout: 10_000 });
    return email;
  }

  test.beforeEach(async ({ authPage, sidebarPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await sidebarPage.navigateTo("Users");
  });

  test("Write column reads Can write for creators by default", async ({
    page,
  }) => {
    const email = await createCreator(page, "badge-test");
    const row = await filterToUser(page, email);
    await expect(row.getByText("Can write", { exact: true })).toBeVisible();
  });

  test("admin removes write access from a creator via the row menu, then grants it back", async ({
    page,
  }) => {
    const email = await createCreator(page, "toggle-off");
    const row = await filterToUser(page, email);
    const trigger = row.getByRole("button", { name: /^User actions for / });

    await openMenu(row);
    await page.getByRole("menuitem", { name: "Remove write access" }).click();
    await expect(row.getByText("Read only", { exact: true })).toBeVisible({
      timeout: 5_000,
    });
    // The toast names what the permission gates: a form submit does not need
    // it (#1831). Exact, so the aria-live announcement does not match too.
    await expect(
      page.getByText(
        "Test Creator can no longer run their own write queries. Submitting forms doesn't need this permission.",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 5_000 });
    // After the refetch and the toast: a remounted row dropped focus (#2098).
    await expect(trigger).toBeFocused();

    await openMenu(row);
    await page.getByRole("menuitem", { name: "Allow writing" }).click();
    await expect(row.getByText("Can write", { exact: true })).toBeVisible({
      timeout: 5_000,
    });
  });

  test("the admin's own row offers no role or write change", async ({
    page,
  }) => {
    const aliceRow = await filterToUser(page, "alice@example.com");
    await openMenu(aliceRow);
    await expect(
      page.getByRole("menuitem", { name: "Require Password Change" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /^Make |write/i }),
    ).toHaveCount(0);
  });

  test("a reader reads Read only and offers no write change", async ({
    page,
  }) => {
    const email = `reader-nowrite-${uid()}@example.com`;
    await waitForUsersTable(page);
    await page.getByRole("button", { name: "Create user" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#user-name").fill("Test Reader");
    await dialog.locator("#user-email").fill(email);
    await dialog.locator("#user-password").fill("password123");
    await dialog.locator("#user-role").click();
    await page.getByRole("option", { name: "Reader" }).click();
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(email)).toBeVisible({ timeout: 10_000 });

    const row = await filterToUser(page, email);
    await expect(row.getByText("Read only", { exact: true })).toBeVisible();
    await openMenu(row);
    await expect(page.getByRole("menuitem", { name: /write/i })).toHaveCount(0);
    await expect(
      page.getByRole("menuitem", { name: "Make creator" }),
    ).toBeVisible();
  });
});

test.describe("Disable and enable a user (#2049)", () => {
  /** Sign in as `email` in a fresh context: refused, or reaches the app. */
  async function expectSignIn(
    browser: import("@playwright/test").Browser,
    email: string,
    password: string,
    allowed: boolean,
  ) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      if (allowed) {
        // login() waits for / and for the server to see this email signed in.
        await new AuthPage(page).login(email, password);
        return;
      }
      await page.goto("/login");
      await page
        .locator('form[data-hydrated="true"]')
        .waitFor({ state: "attached", timeout: 10_000 });
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByText("Invalid email or password")).toBeVisible({
        timeout: 10_000,
      });
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await context.close();
    }
  }

  test("an admin disables a user, whose sign-in is refused, then enables them and it works again", async ({
    authPage,
    sidebarPage,
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    await authPage.login(ALICE.email, ALICE.password);

    const suffix = uid();
    const name = `Disable Me ${suffix}`;
    const email = `disable-${suffix}@example.com`;
    const password = "password123";
    const res = await page.request.post("/api/users", {
      data: { name, email, password },
    });
    expect(res.ok()).toBeTruthy();
    const { data: created } = await res.json();

    try {
      await sidebarPage.navigateTo("Users");
      const row = await filterToUser(page, email);
      const badge = row.getByText("Disabled", { exact: true });
      await expect(badge).toHaveCount(0);

      // Disable asks first, and says what it does.
      await row.getByRole("button", { name: "User actions" }).click();
      await page.getByRole("menuitem", { name: "Disable" }).click();
      const confirm = page.getByRole("alertdialog", { name: "Disable User" });
      await expect(confirm).toContainText(
        `${name} will not be able to sign in, and their API keys will stop working.`,
      );
      await confirm.getByRole("button", { name: "Disable" }).click();

      await expect(badge).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByText(
          `${name} can no longer sign in, and their API keys no longer work.`,
          { exact: true },
        ),
      ).toBeVisible();
      await expectSignIn(browser, email, password, false);

      // Enable needs no confirmation.
      await row.getByRole("button", { name: "User actions" }).click();
      await page.getByRole("menuitem", { name: "Enable" }).click();
      await expect(
        page.getByText(
          `${name} can sign in again, and their API keys work again.`,
          { exact: true },
        ),
      ).toBeVisible({ timeout: 10_000 });
      await expect(badge).toHaveCount(0);
      await row.getByRole("button", { name: "User actions" }).click();
      await expect(
        page.getByRole("menuitem", { name: "Disable" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");

      await expectSignIn(browser, email, password, true);
    } finally {
      await page.request.delete(`/api/users/${created.id}`);
    }
  });
});

test.describe("User management — non-admin access", () => {
  test("reader sees the denial state without any admin affordances (#1036)", async ({
    authPage,
    page,
  }) => {
    await authPage.login(CAROL.email, CAROL.password);
    await page.goto("/users");

    // Server-side gate renders the denial state…
    await expect(page.getByText("Admin access required")).toBeVisible({
      timeout: 10_000,
    });
    // …and no admin-only affordances leak into the header (UI gate, #1036).
    await expect(
      page.getByRole("button", { name: "Create user" }),
    ).not.toBeVisible();
  });
});
