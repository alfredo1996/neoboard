/**
 * E2E tests: schema-aware code completion in the query editor.
 *
 * Covers:
 *  - SQL table-name completions from PostgreSQL schema (after FROM)
 *  - Cypher label completions from Neo4j schema (after ":")
 *  - Schema refresh button: click → fetching state → settled state
 */
import { test, expect, ALICE, createTestDashboard } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait until the CodeMirror editor is mounted, writable, and fully initialised.
 */
async function waitForEditorReady(dialog: Locator, page: Page): Promise<void> {
  const container = dialog.locator("[data-testid='codemirror-container']");
  await container
    .locator(".cm-editor")
    .waitFor({ state: "visible", timeout: 10_000 });
  await expect(container).toHaveAttribute("data-readonly", "false", {
    timeout: 10_000,
  });
  await expect(container).toHaveAttribute("data-editor-ready", "true", {
    timeout: 15_000,
  });

  // Poll for 3 consecutive "ready" checks (600 ms stable window) to rule out
  // any re-mount triggered by async schema-fetch or dynamic-import side-effects.
  let stableCount = 0;
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(200);
    const ready = await container.getAttribute("data-editor-ready");
    stableCount = ready === "true" ? stableCount + 1 : 0;
    if (stableCount >= 3) break;
  }
  if (stableCount < 3) {
    throw new Error(
      `Editor never stabilized: data-editor-ready was "true" for ${stableCount}/3 consecutive checks`,
    );
  }
}

/**
 * Wait for the schema API response to complete (watches the /schema network
 * request) and then allows time for the async reconfigure pipeline:
 *   Zustand store → React re-render → QueryEditor schema effect → loadSqlExt → dispatch
 *
 * Uses the Refresh button's enabled state as the primary readiness signal,
 * then polls until no further CM6 reconfigurations are happening.
 */
async function waitForSchemaLoaded(dialog: Locator, page: Page): Promise<void> {
  const refreshBtn = dialog.getByRole("button", { name: "Refresh schema" });
  await expect(refreshBtn).toBeVisible({ timeout: 10_000 });
  await expect(refreshBtn).toBeEnabled({ timeout: 20_000 });

  // Wait for the editor to settle after the schema propagates through the
  // async pipeline: fetch → store → render → effect → dynamic import → dispatch.
  // Poll data-editor-ready to confirm the editor hasn't been torn down by a
  // late-arriving reconfigure.
  const container = dialog.locator("[data-testid='codemirror-container']");
  let stableCount = 0;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(200);
    const ready = await container.getAttribute("data-editor-ready");
    stableCount = ready === "true" ? stableCount + 1 : 0;
    if (stableCount >= 5) break; // 1 s stable window
  }
}

/**
 * Trigger autocomplete in the Cypher editor with retry.
 * The neo4j-cypher editor's completion source needs the schema to be fully
 * propagated through the editor-support instance before it returns results.
 * Retry Ctrl+Space until the popup appears.
 *
 * Note: Do NOT press Escape — it will close the parent dialog, not the popup.
 */
async function triggerCypherAutocomplete(
  page: Page,
  maxRetries = 5,
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    await page.keyboard.press("Control+Space");
    try {
      await page.waitForFunction(
        () => !!document.querySelector(".cm-tooltip-autocomplete"),
        { timeout: 2_000 },
      );
      return; // Popup appeared
    } catch {
      // Popup didn't appear — wait and retry
      await page.waitForTimeout(1000);
    }
  }
}

/**
 * Click inside the CM editor content area and type text via keyboard events.
 * After typing, re-clicks the editor to ensure focus is fully settled — the
 * neo4j-cypher editor's completion keymap requires a settled focus state that
 * keyboard.type() alone doesn't guarantee.
 */
async function typeInCmEditor(
  dialog: Locator,
  page: Page,
  text: string,
): Promise<void> {
  const cm = dialog.locator("[data-testid='codemirror-container'] .cm-content");
  await cm.click();
  await page.keyboard.type(text, { delay: 30 });
  // Re-focus: the Cypher editor's CM6 completion keymap needs a settled focus
  // state after programmatic typing. Without this, Ctrl+Space may not trigger.
  await page.waitForTimeout(100);
  await cm.click();
}

/**
 * Wait for the CM6 autocomplete popup to appear. Uses raw JS DOM query via
 * waitForFunction because Playwright's locator system cannot reliably resolve
 * the dynamically-created `.cm-tooltip-autocomplete` element.
 */
async function waitForAutocompletePopup(
  page: Page,
  timeout = 10_000,
): Promise<void> {
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".cm-tooltip-autocomplete");
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    },
    { timeout },
  );
}

/**
 * Check if a specific completion option is visible in the autocomplete popup.
 */
async function hasCompletionItem(
  page: Page,
  pattern: RegExp,
): Promise<boolean> {
  return page.evaluate((pat) => {
    const el = document.querySelector(".cm-tooltip-autocomplete");
    if (!el) return false;
    const items = el.querySelectorAll("[role='option'], li");
    return Array.from(items).some((item) =>
      new RegExp(pat).test(item.textContent ?? ""),
    );
  }, pattern.source);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

test.describe("Code completion — Cypher + SQL", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  // Autocomplete tests depend on schema fetch + async reconfigure; allow extra time.
  test.setTimeout(60_000);

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Code Completion ${Date.now()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(page.getByText("Editing:")).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  // ── SQL: table-name completions ─────────────────────────────────────────

  test("SQL editor shows table name completions from PostgreSQL schema", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Select the PostgreSQL connection
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /PostgreSQL/i }).click();

    await waitForEditorReady(dialog, page);
    await waitForSchemaLoaded(dialog, page);

    await typeInCmEditor(dialog, page, "SELECT * FROM m");
    await page.keyboard.press("Control+Space");
    await waitForAutocompletePopup(page);

    // The seeded PostgreSQL database exposes a "movies" table.
    expect(await hasCompletionItem(page, /movies/i)).toBe(true);
  });

  test("SQL editor shows column name completions from PostgreSQL schema", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: /PostgreSQL/i }).click();

    await waitForEditorReady(dialog, page);
    await waitForSchemaLoaded(dialog, page);

    // Use table-qualified name: @codemirror/lang-sql shows column completions
    // only after a table qualifier (e.g., "movies.").
    await typeInCmEditor(dialog, page, "SELECT movies.");
    await page.keyboard.press("Control+Space");

    await waitForAutocompletePopup(page);

    // The "movies" table has a "title" column in the seed data.
    expect(await hasCompletionItem(page, /\btitle\b/i)).toBe(true);
  });

  // ── Cypher: label completions ───────────────────────────────────────────

  test("Cypher editor shows schema-aware completions from Neo4j", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // The first connection option is the seeded Neo4j instance.
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    await waitForEditorReady(dialog, page);
    await waitForSchemaLoaded(dialog, page);

    // Type "MATCH (n:" — the ":" triggers label completions in a node pattern.
    await typeInCmEditor(dialog, page, "MATCH (n:");

    await triggerCypherAutocomplete(page);
    await waitForAutocompletePopup(page);

    // After ":" in a node pattern, the completion engine returns node labels
    // (e.g., Movie, Person) and property keys from the schema.
    const hasItems = await page.evaluate(() => {
      const el = document.querySelector(".cm-tooltip-autocomplete");
      if (!el) return false;
      return el.querySelectorAll("[role='option'], li").length > 0;
    });
    expect(hasItems).toBe(true);
  });

  test("Cypher editor shows completions for relationship patterns", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    await waitForEditorReady(dialog, page);
    await waitForSchemaLoaded(dialog, page);

    // ":" inside a relationship pattern is a trigger string that opens
    // the autocomplete popup with schema-derived completions.
    await typeInCmEditor(dialog, page, "MATCH ()-[r:");
    await triggerCypherAutocomplete(page);

    await waitForAutocompletePopup(page);

    // Verify schema-derived items appear (property keys or relationship types).
    const hasItems = await page.evaluate(() => {
      const el = document.querySelector(".cm-tooltip-autocomplete");
      if (!el) return false;
      return el.querySelectorAll("[role='option'], li").length > 0;
    });
    expect(hasItems).toBe(true);
  });

  // ── Schema refresh button ───────────────────────────────────────────────

  test("schema refresh button is visible after selecting a connection", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Refresh button should NOT be visible before a connection is chosen
    await expect(
      dialog.getByRole("button", { name: "Refresh schema" }),
    ).not.toBeVisible();

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    // Now it should appear (connectionId is set)
    await expect(
      dialog.getByRole("button", { name: "Refresh schema" }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("schema refresh button triggers schema re-fetch", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();

    await waitForEditorReady(dialog, page);
    await waitForSchemaLoaded(dialog, page);

    const refreshBtn = dialog.getByRole("button", { name: "Refresh schema" });

    // Confirm it's enabled before clicking
    await expect(refreshBtn).toBeEnabled();

    // Intercept the schema API call to verify it is re-issued
    const [schemaRequest] = await Promise.all([
      page.waitForRequest((req) => req.url().includes("/schema"), {
        timeout: 10_000,
      }),
      refreshBtn.click(),
    ]);
    expect(schemaRequest).toBeTruthy();

    // Button is disabled while the new fetch is in-flight
    await expect(refreshBtn).toBeDisabled({ timeout: 3_000 });

    // After the fetch resolves, the button becomes enabled again
    await expect(refreshBtn).toBeEnabled({ timeout: 20_000 });
  });
});
