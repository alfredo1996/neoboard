import { test, expect, ALICE, createTestDashboard } from "./fixtures";

test.describe("Form widget", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Form Widget ${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("should create a form widget and show live preview from query placeholders", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select "Form" chart type
    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Form" }).click();

    // Select Neo4j connection
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Write a mutation query with $param_xxx placeholders
    const cm = dialog.locator(
      "[data-testid='codemirror-container'] .cm-content",
    );
    await cm.click();
    await page.keyboard.insertText(
      "CREATE (n:FormTestNode {name: $param_name, email: $param_email})",
    );

    // The "Run" button should NOT be visible for form widgets (no onRun prop)
    await expect(
      dialog.getByRole("button", { name: "Run" }),
    ).not.toBeVisible();

    // The preview panel should show a live form with inputs derived from the query
    // Wait for form fields to appear in the preview
    await expect(dialog.getByLabel("name")).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByLabel("email")).toBeVisible({ timeout: 5_000 });

    // The submit button should be visible (default text "Submit")
    await expect(
      dialog.getByRole("button", { name: "Submit" }),
    ).toBeVisible();

    // Add the widget
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("should render form widget on dashboard after save", async ({
    page,
  }) => {
    // Add a form widget
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Form" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    const cm = dialog.locator(
      "[data-testid='codemirror-container'] .cm-content",
    );
    await cm.click();
    await page.keyboard.insertText(
      "CREATE (n:FormTestNode {firstName: $param_firstName, age: $param_age})",
    );

    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();

    // Save the dashboard
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled({
      timeout: 10_000,
    });

    // Navigate to view mode
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // The form widget should render with the derived fields
    await expect(page.getByLabel("firstName")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("age")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Submit" }),
    ).toBeVisible();
  });

  test("should submit form and show success message", async ({ page }) => {
    // Add a form widget that creates a temporary node
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Form" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    const cm = dialog.locator(
      "[data-testid='codemirror-container'] .cm-content",
    );
    await cm.click();
    await page.keyboard.insertText(
      "CREATE (n:FormE2ETest {name: $param_name}) RETURN n.name AS name",
    );

    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();

    // Save and go to view mode
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // Wait for the form to render
    const nameInput = page.getByLabel("name");
    await expect(nameInput).toBeVisible({ timeout: 15_000 });

    // Fill the form
    await nameInput.fill("E2E Test Person");

    // Submit the form
    await page.getByRole("button", { name: "Submit" }).click();

    // Wait for the submit button to show "Submitting..." then back to "Submit"
    // or for the success message to appear
    await expect(page.getByText("Form submitted successfully")).toBeVisible({
      timeout: 15_000,
    });

    // After success with resetOnSuccess (default: true), the input should be cleared
    await expect(nameInput).toHaveValue("");
  });

  test("form preview updates live as query text changes", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Form" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    const cm = dialog.locator(
      "[data-testid='codemirror-container'] .cm-content",
    );
    await cm.click();

    // Start with one parameter
    await page.keyboard.insertText("CREATE (n:Test {name: $param_name})");
    await expect(dialog.getByLabel("name")).toBeVisible({ timeout: 5_000 });

    // No email field yet
    await expect(dialog.getByLabel("email")).not.toBeVisible();

    // Clear and type a query with two parameters
    // Use Ctrl+A to select all, then type new query
    await cm.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.insertText(
      "CREATE (n:Test {name: $param_name, email: $param_email})",
    );

    // Now both fields should be visible
    await expect(dialog.getByLabel("name")).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByLabel("email")).toBeVisible({ timeout: 5_000 });
  });

  test("form widget requires connection and query to save", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Form" }).click();

    // Without connection and query, the Add Widget button should be disabled
    await expect(
      dialog.getByRole("button", { name: "Add Widget" }),
    ).toBeDisabled();

    // Select connection but no query — still disabled
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
    await expect(
      dialog.getByRole("button", { name: "Add Widget" }),
    ).toBeDisabled();

    // Add query — now enabled
    const cm = dialog.locator(
      "[data-testid='codemirror-container'] .cm-content",
    );
    await cm.click();
    await page.keyboard.insertText("CREATE (n:Test {val: $param_val})");
    await expect(
      dialog.getByRole("button", { name: "Add Widget" }),
    ).toBeEnabled();
  });
});

// Note: Write permission denial (reader role returning 403) is tested in the
// unit test suite at app/src/app/api/query/write/__tests__/route.test.ts.
// No seeded reader-role user exists in the E2E environment, so we skip the
// E2E permission test. The API route enforces `canWrite` server-side.
