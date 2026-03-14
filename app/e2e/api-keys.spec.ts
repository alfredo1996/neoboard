import { test, expect, ALICE } from "./fixtures";

test.describe("API Key management", () => {
  test.beforeEach(async ({ authPage, sidebarPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await sidebarPage.navigateTo("Settings");
  });

  test("should navigate to the API Keys settings page", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: "API Keys" })
    ).toBeVisible();
  });

  test("should create an API key and display it once", async ({ page }) => {
    await page.getByRole("button", { name: "Create API Key" }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#key-name").fill("Test CI Key");
    await dialog.getByRole("button", { name: "Generate Key" }).click();

    // After generation: dialog title changes to "API Key Created"
    await expect(
      dialog.getByRole("heading", { name: "API Key Created" })
    ).toBeVisible({ timeout: 10000 });

    // Key should start with nb_ — use the data-testid for reliable targeting
    const keyDisplay = dialog.getByTestId("api-key-display");
    const keyText = await keyDisplay.locator("span").first().textContent();
    expect(keyText).toMatch(/^nb_[0-9a-f]{64}$/);

    await dialog.getByRole("button", { name: "Done" }).click();

    // Key should now appear in the table — use exact to avoid matching the revoke button cell
    await expect(
      page.getByRole("cell", { name: "Test CI Key", exact: true })
    ).toBeVisible();
  });

  test("should show the key in the list after creation", async ({ page }) => {
    const keyName = `E2E Key ${Date.now()}`;
    await page.getByRole("button", { name: "Create API Key" }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#key-name").fill(keyName);
    await dialog.getByRole("button", { name: "Generate Key" }).click();

    await expect(
      dialog.getByRole("heading", { name: "API Key Created" })
    ).toBeVisible({ timeout: 10000 });
    await dialog.getByRole("button", { name: "Done" }).click();

    await expect(
      page.getByRole("cell", { name: keyName, exact: true })
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
      dialog.getByRole("heading", { name: "API Key Created" })
    ).toBeVisible({ timeout: 10000 });

    // Grab the plaintext key from the data-testid display
    const keyText = await dialog
      .getByTestId("api-key-display")
      .locator("span")
      .first()
      .textContent();
    expect(keyText).toMatch(/^nb_[0-9a-f]{64}$/);

    await dialog.getByRole("button", { name: "Done" }).click();

    // Use the API key to make a programmatic request
    const res = await request.get("http://localhost:3100/api/keys", {
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
      dialog.getByRole("heading", { name: "API Key Created" })
    ).toBeVisible({ timeout: 10000 });
    await dialog.getByRole("button", { name: "Done" }).click();

    // Verify key appears in list (exact match avoids the revoke button cell)
    await expect(
      page.getByRole("cell", { name: keyName, exact: true })
    ).toBeVisible();

    // Click the revoke button in the same row
    const row = page.getByRole("row").filter({ hasText: keyName });
    await row.getByRole("button", { name: `Revoke ${keyName}` }).click();

    // Confirm revocation in the alert dialog
    const confirmDialog = page.getByRole("alertdialog");
    await confirmDialog.getByRole("button", { name: "Revoke" }).click();

    // Key should no longer be in the list
    await expect(
      page.getByRole("cell", { name: keyName, exact: true })
    ).not.toBeVisible({ timeout: 5000 });
  });

  test("should validate that name is required", async ({ page }) => {
    await page.getByRole("button", { name: "Create API Key" }).first().click();

    const dialog = page.getByRole("dialog");
    // Generate Key should be disabled when name is empty
    await expect(
      dialog.getByRole("button", { name: "Generate Key" })
    ).toBeDisabled();
  });
});

test.describe("API key authentication", () => {
  test("should return 401 when using an invalid API key", async ({
    request,
  }) => {
    const res = await request.get("http://localhost:3100/api/keys", {
      headers: {
        Authorization: "Bearer nb_" + "f".repeat(64),
      },
    });
    expect(res.status()).toBe(401);
  });
});
