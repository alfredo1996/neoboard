import { test, expect, ALICE } from "./fixtures";
import { AuthPage } from "./pages/auth";

test.describe("API Key management", () => {
  test.beforeEach(async ({ authPage, sidebarPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await sidebarPage.navigateTo("Settings");
    // Settings now defaults to Profile tab — navigate to API Keys tab
    await page.getByRole("button", { name: "API Keys" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "API Keys" }),
    ).toBeVisible();
  });

  test("should navigate to the API Keys settings page", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: "API Keys" }),
    ).toBeVisible();
  });

  test("should create an API key and display it once", async ({ page }) => {
    await page.getByRole("button", { name: "Create API Key" }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#key-name").fill("Test CI Key");
    await dialog.getByRole("button", { name: "Generate Key" }).click();

    // After generation: dialog title changes to "API Key Created"
    await expect(
      dialog.getByRole("heading", { name: "API Key Created" }),
    ).toBeVisible({ timeout: 10000 });

    // Key should start with nb_ — use the data-testid for reliable targeting
    const keyDisplay = dialog.getByTestId("api-key-display");
    const keyText = await keyDisplay.locator("span").first().textContent();
    expect(keyText).toMatch(/^nb_[0-9a-f]{64}$/);

    // The secret must stay on a single line (no break-all wrapping) (#1038).
    await expect(keyDisplay.locator("span").first()).toHaveClass(
      /whitespace-nowrap/,
    );

    await dialog.getByRole("button", { name: "Done" }).click();

    // Key should now appear in the table — use exact to avoid matching the revoke button cell
    await expect(
      page.getByRole("cell", { name: "Test CI Key", exact: true }),
    ).toBeVisible();

    // The list shows a masked, non-secret prefix of the key (#1038): the
    // first 11 chars of the token followed by an ellipsis + mask. Never the
    // full 64-hex secret.
    const maskedPrefix = `${keyText!.slice(0, 11)}…****`;
    await expect(
      page.getByRole("cell", { name: maskedPrefix, exact: true }),
    ).toBeVisible();
  });

  test("should show the key in the list after creation", async ({ page }) => {
    const keyName = `E2E Key ${Date.now()}`;
    await page.getByRole("button", { name: "Create API Key" }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#key-name").fill(keyName);
    await dialog.getByRole("button", { name: "Generate Key" }).click();

    await expect(
      dialog.getByRole("heading", { name: "API Key Created" }),
    ).toBeVisible({ timeout: 10000 });
    await dialog.getByRole("button", { name: "Done" }).click();

    await expect(
      page.getByRole("cell", { name: keyName, exact: true }),
    ).toBeVisible();
  });

  test("should use API key to authenticate a programmatic request", async ({
    page,
    request,
  }) => {
    const keyName = `API Auth Test ${Date.now()}`;
    await page.getByRole("button", { name: "Create API Key" }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#key-name").fill(keyName);
    await dialog.getByRole("button", { name: "Generate Key" }).click();

    await expect(
      dialog.getByRole("heading", { name: "API Key Created" }),
    ).toBeVisible({ timeout: 10000 });

    // Grab the plaintext key from the data-testid display
    const keyText = await dialog
      .getByTestId("api-key-display")
      .locator("span")
      .first()
      .textContent();
    expect(keyText).toMatch(/^nb_[0-9a-f]{64}$/);

    await dialog.getByRole("button", { name: "Done" }).click();

    // Use the API key to make a programmatic request.
    // request.get() uses the baseURL from Playwright config, so we use a relative path.
    const res = await request.get("/api/keys", {
      headers: {
        Authorization: `Bearer ${keyText}`,
      },
    });
    expect(res.ok()).toBe(true);
  });

  test("should revoke a key and remove it from the list", async ({ page }) => {
    const keyName = `Revoke Test ${Date.now()}`;
    await page.getByRole("button", { name: "Create API Key" }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#key-name").fill(keyName);
    await dialog.getByRole("button", { name: "Generate Key" }).click();

    await expect(
      dialog.getByRole("heading", { name: "API Key Created" }),
    ).toBeVisible({ timeout: 10000 });
    await dialog.getByRole("button", { name: "Done" }).click();

    // Verify key appears in list (exact match avoids the revoke button cell)
    await expect(
      page.getByRole("cell", { name: keyName, exact: true }),
    ).toBeVisible();

    // Click the revoke button in the same row
    const row = page.getByRole("row").filter({ hasText: keyName });
    await row.getByRole("button", { name: `Revoke ${keyName}` }).click();

    // Confirm revocation in the alert dialog
    const confirmDialog = page.getByRole("alertdialog");
    await confirmDialog.getByRole("button", { name: "Revoke" }).click();

    // Key should no longer be in the list
    await expect(
      page.getByRole("cell", { name: keyName, exact: true }),
    ).not.toBeVisible({ timeout: 5000 });
  });

  test("should validate that name is required", async ({ page }) => {
    await page.getByRole("button", { name: "Create API Key" }).first().click();

    const dialog = page.getByRole("dialog");
    // Generate Key should be disabled when name is empty
    await expect(
      dialog.getByRole("button", { name: "Generate Key" }),
    ).toBeDisabled();
  });
});

test.describe("API key authentication", () => {
  test("should return 401 when using an invalid API key", async ({
    request,
  }) => {
    // request.get() uses the baseURL from Playwright config, so we use a relative path.
    const res = await request.get("/api/keys", {
      headers: {
        Authorization: "Bearer nb_" + "f".repeat(64),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("a disabled user's key is refused, and works again when re-enabled (#2003)", async ({
    browser,
    request,
  }) => {
    // Disabling a user blocked their sign-in but not their keys: the key
    // lookup never read users.disabledAt. Real database, real join.
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `disabled-key-${suffix}@example.com`;
    const password = "password123";
    const adminContext = await browser.newContext();
    const userContext = await browser.newContext();
    const admin = await adminContext.newPage();
    let userId: string | undefined;
    try {
      await new AuthPage(admin).login(ALICE.email, ALICE.password);
      const created = await admin.request.post("/api/users", {
        data: { name: `Disabled key ${suffix}`, email, password },
      });
      expect(created.status()).toBe(201);
      userId = (await created.json()).data.id;

      const user = await userContext.newPage();
      await new AuthPage(user).login(email, password);
      const keyRes = await user.request.post("/api/keys", {
        data: { name: `key ${suffix}` },
      });
      expect(keyRes.status()).toBe(201);
      const key: string = (await keyRes.json()).data.key;
      const asKey = { headers: { Authorization: `Bearer ${key}` } };

      expect((await request.get("/api/dashboards", asKey)).status()).toBe(200);

      const disable = await admin.request.patch(`/api/users/${userId}`, {
        data: { disabled: true },
      });
      expect(disable.ok()).toBe(true);
      expect((await request.get("/api/dashboards", asKey)).status()).toBe(401);
      // Nor can the disabled user mint a fresh key with the old one.
      const mint = await request.post("/api/keys", {
        ...asKey,
        data: { name: `second ${suffix}` },
      });
      expect(mint.status()).toBe(401);

      const enable = await admin.request.patch(`/api/users/${userId}`, {
        data: { disabled: false },
      });
      expect(enable.ok()).toBe(true);
      expect((await request.get("/api/dashboards", asKey)).status()).toBe(200);
    } finally {
      if (userId) await admin.request.delete(`/api/users/${userId}`);
      await userContext.close();
      await adminContext.close();
    }
  });
});
