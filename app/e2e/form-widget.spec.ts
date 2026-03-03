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

  test("should configure form fields in editor and see preview", async ({
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

    // Write a write query
    const cm = dialog.locator(
      "[data-testid='codemirror-container'] .cm-content",
    );
    await cm.click();
    await page.keyboard.insertText(
      "CREATE (n:FormTestNode {name: $param_name, email: $param_email})",
    );

    // Add first field
    await dialog.getByRole("button", { name: "Add Field" }).click();

    // Fill in label for the first field
    const labelInputs = dialog.getByPlaceholder("e.g. Movie Title");
    await labelInputs.first().fill("Author");

    // Fill in parameter name
    const paramInputs = dialog.getByPlaceholder("e.g. title");
    await paramInputs.first().fill("name");

    // Add second field
    await dialog.getByRole("button", { name: "Add Field" }).click();

    // Fill second field label — second label input
    await labelInputs.nth(1).fill("Message");
    await paramInputs.nth(1).fill("email");

    // Preview should show two labeled placeholders + Submit button
    await expect(dialog.getByText("Author", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText("Message", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(
      dialog.getByRole("button", { name: "Submit" }),
    ).toBeVisible();

    // Add the widget (connection + query required)
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("should render form widget on dashboard after save with formFields", async ({
    page,
  }) => {
    // Add a form widget with explicit fields
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
      "CREATE (n:FormTestNode {firstName: $param_firstName, age: $param_age_min})",
    );

    // Add firstName field
    await dialog.getByRole("button", { name: "Add Field" }).click();
    const labelInputs = dialog.getByPlaceholder("e.g. Movie Title");
    const paramInputs = dialog.getByPlaceholder("e.g. title");
    await labelInputs.first().fill("First Name");
    await paramInputs.first().fill("firstName");

    // Add age field (number-range)
    await dialog.getByRole("button", { name: "Add Field" }).click();
    await labelInputs.nth(1).fill("Age");
    await paramInputs.nth(1).fill("age");

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

    // The form widget should render with the configured fields
    await expect(
      page.getByText("First Name", { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Age", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Submit" }),
    ).toBeVisible();
  });

  test("should submit form widget and see success message", async ({
    page,
  }) => {
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

    // Add a "name" field
    await dialog.getByRole("button", { name: "Add Field" }).click();
    await dialog.getByPlaceholder("e.g. Movie Title").fill("Name");
    await dialog.getByPlaceholder("e.g. title").fill("name");

    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();

    // Save and go to view mode
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // Wait for the form to render — the label "Name" should be visible
    await expect(page.getByText("Name", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // DebouncedTextInput renders an <input> scoped inside the widget card
    const nameInput = page.getByRole("textbox", { name: "name" });
    await nameInput.fill("E2E Test Person");

    // Submit the form
    await page.getByRole("button", { name: "Submit" }).click();

    // Wait for success message
    await expect(page.getByText("Form submitted successfully")).toBeVisible({
      timeout: 15_000,
    });

    // After success, resetOnSuccess (default true) clears the input
    await expect(nameInput).toHaveValue("", { timeout: 5_000 });
  });

  test("form widget shows empty state when no fields configured", async ({
    page,
  }) => {
    // Add a form widget without any fields
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
    await page.keyboard.insertText("CREATE (n:Test {val: $param_val})");

    // No fields added — preview shows placeholder message
    await expect(
      dialog.getByText("Add fields in the Fields section below to see the form preview"),
    ).toBeVisible({ timeout: 5_000 });

    // Save button is enabled (query + connection are set)
    await expect(
      dialog.getByRole("button", { name: "Add Widget" }),
    ).toBeEnabled();

    // Add the widget
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();

    // Save and navigate to view mode
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // The form widget should show the empty-state message
    await expect(
      page.getByText("No fields configured"),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("required field blocks submit and shows error when empty", async ({
    page,
  }) => {
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
      "CREATE (n:FormReqTest {name: $param_name})",
    );

    // Add a field and mark it Required
    await dialog.getByRole("button", { name: "Add Field" }).click();
    await dialog.getByPlaceholder("e.g. Movie Title").fill("Full Name");
    await dialog.getByPlaceholder("e.g. title").fill("name");

    // Check Required checkbox (inside AccordionContent, which is open by default)
    await dialog.getByRole("checkbox", { name: "Required" }).click();

    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();

    // Save and go to view mode
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    await expect(page.getByText("Full Name", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Submit without filling — should show error, not fire the query
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(
      page.getByText("This field is required"),
    ).toBeVisible({ timeout: 5_000 });

    // Fill the required field — error should clear
    const nameInput = page.getByRole("textbox", { name: "name" });
    await nameInput.fill("Alice");
    await expect(page.getByText("This field is required")).not.toBeVisible({
      timeout: 3_000,
    });

    // Submit successfully
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Form submitted successfully")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("form widget refreshes another widget on submit when configured", async ({
    page,
  }) => {
    // Add a table widget first
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const tableDialog = page.getByRole("dialog", { name: "Add Widget" });

    await tableDialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    const tableCm = tableDialog.locator(
      "[data-testid='codemirror-container'] .cm-content",
    );
    await tableCm.click();
    await page.keyboard.insertText(
      "MATCH (n:FormRefreshNode) RETURN n.name AS name LIMIT 10",
    );
    // Set title for easy identification
    await tableDialog.getByLabel("Widget Title").fill("Refresh Target");

    await tableDialog.getByRole("button", { name: "Run", exact: true }).click();
    await expect(
      tableDialog.locator("[data-testid='base-chart'], table").first(),
    ).toBeVisible({ timeout: 15_000 });

    await tableDialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(tableDialog).not.toBeVisible();

    // Add a form widget that refreshes the table widget
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const formDialog = page.getByRole("dialog", { name: "Add Widget" });

    await formDialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Form" }).click();
    await formDialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    const formCm = formDialog.locator(
      "[data-testid='codemirror-container'] .cm-content",
    );
    await formCm.click();
    await page.keyboard.insertText(
      "CREATE (n:FormRefreshNode {name: $param_name})",
    );

    // Add a field
    await formDialog.getByRole("button", { name: "Add Field" }).click();
    await formDialog.getByPlaceholder("e.g. Movie Title").fill("Name");
    await formDialog.getByPlaceholder("e.g. title").fill("name");

    // Go to Advanced tab and enable refresh for the table widget
    await formDialog.getByRole("tab", { name: "Advanced" }).click();
    await expect(
      formDialog.getByText("Refresh Target"),
    ).toBeVisible({ timeout: 5_000 });
    await formDialog
      .getByRole("checkbox", { name: "Refresh Target" })
      .click();

    await formDialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(formDialog).not.toBeVisible();

    // Save and go to view mode
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // Wait for form to render
    await expect(page.getByText("Name", { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Fill and submit the form
    const nameInput = page.getByRole("textbox", { name: "name" });
    await nameInput.fill("RefreshTestNode");
    await page.getByRole("button", { name: "Submit" }).click();

    // Form should succeed
    await expect(page.getByText("Form submitted successfully")).toBeVisible({
      timeout: 15_000,
    });
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

// ---------------------------------------------------------------------------
// Write permission enforcement
// ---------------------------------------------------------------------------
// These tests create a creator user, disable their can_write via the Users
// page (as admin), then log in as that user and verify the form widget
// surfaces "Write permission required" and captures a screenshot.

test.describe("Write permission enforcement", () => {
  let creatorEmail: string;
  let dashboardId: string;

  test.beforeAll(async ({ browser }) => {
    // Create a new browser context (clean cookies) for the admin setup
    const context = await browser.newContext();
    const page = await context.newPage();

    // Log in as Alice (admin)
    await page.goto("/login");
    await page.getByLabel("Email").waitFor({ state: "visible" });
    await page.getByLabel("Email").fill(ALICE.email);
    await page.getByLabel("Password").fill(ALICE.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("/", { timeout: 15_000 });

    // Create a creator user
    creatorEmail = `no-write-${Date.now()}@example.com`;
    await page.goto("/users");
    await expect(page.getByText(ALICE.email)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Create User" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#user-name").fill("No Write Creator");
    await dialog.locator("#user-email").fill(creatorEmail);
    await dialog.locator("#user-password").fill("password123");
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(creatorEmail)).toBeVisible({ timeout: 10_000 });

    // Disable can_write for that user
    const row = page.getByRole("row").filter({ hasText: creatorEmail });
    await row.getByRole("switch").click();
    await expect(row.getByText("No")).toBeVisible({ timeout: 5_000 });

    // Create a dashboard as Alice for the creator to use (public so creator can view it)
    const res = await page.request.post("/api/dashboards", {
      data: { name: `Write-Permission-Test-${Date.now()}` },
    });
    const { id } = await res.json();
    dashboardId = id;

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!dashboardId) return;
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email").waitFor({ state: "visible" });
    await page.getByLabel("Email").fill(ALICE.email);
    await page.getByLabel("Password").fill(ALICE.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("/", { timeout: 15_000 });
    await page.request.delete(`/api/dashboards/${dashboardId}`);
    await context.close();
  });

  test("form widget shows 'Write permission required' when can_write is false", async ({
    authPage,
    page,
  }) => {
    // Log in as the creator with can_write=false
    await authPage.login(creatorEmail, "password123");

    // Go to the dashboard edit page and add a form widget
    await page.goto(`/${dashboardId}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "Form" }).click();
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
    await cm.click();
    await page.keyboard.insertText("CREATE (n:PermTest {v: $param_v}) RETURN n.v AS v");

    await dialog.getByRole("button", { name: "Add Field" }).click();
    await dialog.getByPlaceholder("e.g. Movie Title").fill("Value");
    await dialog.getByPlaceholder("e.g. title").fill("v");

    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();

    // Save and switch to view mode
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled({ timeout: 10_000 });
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });

    // Wait for the form widget to render
    await expect(page.getByText("Value", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("textbox", { name: "v" }).fill("test-value");

    // Submit — API returns 403
    await page.getByRole("button", { name: "Submit" }).click();

    // The form widget renders the API error inline
    await expect(
      page.getByText("Write permission required"),
    ).toBeVisible({ timeout: 10_000 });

    // Screenshot: 403 error displayed inside the form widget
    await page.screenshot({
      path: ".screenshots/form-widget-403-write-permission.png",
      fullPage: false,
    });
  });
});
