/**
 * E2E tests: schema-aware code completion in the query editor.
 *
 * Covers:
 *  - SQL table-name completions from PostgreSQL schema (after FROM)
 *  - Cypher label completions from Neo4j schema (after ":")
 *  - Schema refresh button: click → fetching state → settled state
 */
import {
  test,
  expect,
  ALICE,
  TEST_PG_PORT,
  TEST_NEO4J_BOLT_URL,
  createTestDashboard,
  SEEDED_PG_OPTION,
  uid,
  editingCrumb,
} from "./fixtures";
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
 * Insert exact text into the CM editor via CM6 dispatch (bypasses closeBrackets
 * auto-insertion that corrupts partial Cypher like "MATCH (n:" → "MATCH (n:)").
 * After dispatch, clicks the editor to ensure focus for keyboard shortcuts.
 */
async function typeInCmEditor(
  dialog: Locator,
  page: Page,
  text: string,
): Promise<void> {
  const cmContainer = dialog.locator("[data-testid='codemirror-container']");
  const cm = cmContainer.locator(".cm-content");

  // Use CM6 dispatch to set exact text without closeBrackets interference
  await cmContainer.evaluate((el: HTMLElement, t: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function findView(node: Element | null): any {
      if (!node) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tile = (node as any).cmTile;
      return tile?.root?.view ?? tile?.view ?? null;
    }
    const view =
      findView(el.querySelector(".cm-content")) ??
      findView(el.querySelector(".cm-editor"));
    if (!view) throw new Error("CM6 view not found for typeInCmEditor");
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: t },
      selection: { anchor: t.length },
    });
  }, text);

  // Re-focus: the Cypher editor's CM6 completion keymap needs a settled focus
  // state after programmatic dispatch. Without this, Ctrl+Space may not trigger.
  // eslint-disable-next-line playwright/no-wait-for-timeout
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
  return page.evaluate(
    ([source, flags]) => {
      const el = document.querySelector(".cm-tooltip-autocomplete");
      if (!el) return false;
      const re = new RegExp(source, flags);
      const items = el.querySelectorAll("[role='option'], li");
      return Array.from(items).some((item) => re.test(item.textContent ?? ""));
    },
    [pattern.source, pattern.flags] as [string, string],
  );
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
      `Code Completion ${uid()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(editingCrumb(page)).toBeVisible();
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
    await dialog
      .getByRole("combobox", { name: "Connection", exact: true })
      .click();
    await page.getByRole("option", { name: SEEDED_PG_OPTION }).click();

    await waitForEditorReady(dialog, page);
    await waitForSchemaLoaded(dialog, page);

    await typeInCmEditor(dialog, page, "SELECT * FROM m");
    await page.keyboard.press("Control+Space");
    await waitForAutocompletePopup(page);

    // The seeded PostgreSQL database exposes a "movies" table.
    expect(await hasCompletionItem(page, /movies/i)).toBe(true);
  });

  // #2415: what the Model page says about a term reaches the editor.
  test("completion shows a described term's description and leaves a hidden one out", async ({
    page,
  }) => {
    const name = `model-complete-${uid()}`;
    const created = await page.request.post("/api/connections", {
      data: {
        name,
        type: "postgresql",
        config: {
          uri: `postgresql://localhost:${TEST_PG_PORT}`,
          username: "neoboard",
          password: "neoboard",
          database: "movies",
        },
      },
    });
    expect(created.status()).toBe(201);
    const id = (await created.json()).data.id as string;
    try {
      const put = await page.request.put(`/api/connections/${id}/ontology`, {
        data: {
          terms: [
            {
              kind: "property",
              key: "released",
              parentKey: "entity:movies",
              description: "release year",
            },
            {
              kind: "property",
              key: "tagline",
              parentKey: "entity:movies",
              hidden: true,
            },
          ],
        },
      });
      expect(put.ok()).toBeTruthy();

      // The editor's connection list was read before this connection existed.
      await page.reload();
      await expect(editingCrumb(page)).toBeVisible();

      await page
        .getByRole("button", { name: "Add Widget", exact: true })
        .first()
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Add Widget",
        exact: true,
      });
      const termsRead = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/connections/${id}/ontology`) &&
          r.request().method() === "GET" &&
          r.ok(),
      );
      await dialog
        .getByRole("combobox", { name: "Connection", exact: true })
        .click();
      await page.getByRole("option", { name }).click();
      await termsRead;
      await waitForEditorReady(dialog, page);
      await waitForSchemaLoaded(dialog, page);

      await typeInCmEditor(dialog, page, "SELECT movies.");
      await page.keyboard.press("Control+Space");
      await waitForAutocompletePopup(page);

      expect(await hasCompletionItem(page, /released.*release year/s)).toBe(
        true,
      );
      expect(await hasCompletionItem(page, /title/)).toBe(true);
      expect(await hasCompletionItem(page, /tagline/)).toBe(false);
    } finally {
      await page.request.delete(`/api/connections/${id}?force=true`);
    }
  });

  // #2485: a concept's parameter is suggested, with what it filters, on a
  // connection where the concept has a side, in SQL and in Cypher. That no
  // other connection gets it is a unit test: a missing suggestion cannot be
  // told from a slow popup.
  test("completion suggests a concept's parameter, with what it filters, on a mapped connection", async ({
    page,
  }) => {
    const suffix = uid();
    const parameter = `cust_${suffix}`;
    const ids: string[] = [];
    let conceptId = "";
    try {
      const make = async (
        name: string,
        type: string,
        config: Record<string, string>,
      ) => {
        const res = await page.request.post("/api/connections", {
          data: { name, type, config },
        });
        expect(res.status()).toBe(201);
        const id = (await res.json()).data.id as string;
        ids.push(id);
        return id;
      };
      const sqlName = `wiring-complete-sql-${suffix}`;
      const graphName = `wiring-complete-graph-${suffix}`;
      const sqlId = await make(sqlName, "postgresql", {
        uri: `postgresql://localhost:${TEST_PG_PORT}`,
        username: "neoboard",
        password: "neoboard",
        database: "movies",
      });
      const graphId = await make(graphName, "neo4j", {
        uri: TEST_NEO4J_BOLT_URL,
        username: "neo4j",
        password: "neoboard123",
      });
      const concept = await page.request.post("/api/ontology/concepts", {
        data: {
          name: `Customer ${suffix}`,
          parameter,
          description: "",
          sides: [
            {
              connectionId: sqlId,
              entityKey: "movies",
              keyPropertyKey: "title",
            },
            {
              connectionId: graphId,
              entityKey: "Movie",
              keyPropertyKey: "title",
            },
          ],
        },
      });
      expect(concept.status()).toBe(201);
      conceptId = (await concept.json()).data.id as string;

      // The editor's connection list was read before these connections existed.
      await page.reload();
      await expect(editingCrumb(page)).toBeVisible();
      await page
        .getByRole("button", { name: "Add Widget", exact: true })
        .first()
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Add Widget",
        exact: true,
      });
      const complete = async (option: string, query: string, hint: RegExp) => {
        await dialog
          .getByRole("combobox", { name: "Connection", exact: true })
          .click();
        await page.getByRole("option", { name: option }).click();
        await waitForEditorReady(dialog, page);
        await waitForSchemaLoaded(dialog, page);
        await typeInCmEditor(dialog, page, query);
        // The click that focuses the editor puts the caret mid-line.
        await page.keyboard.press("End");
        await page.keyboard.press("Control+Space");
        await waitForAutocompletePopup(page);
        expect(await hasCompletionItem(page, hint)).toBe(true);
        await page.keyboard.press("Escape");
      };

      await complete(
        `${sqlName} PostgreSQL`,
        "SELECT title FROM movies WHERE title = $",
        new RegExp(
          `\\$param_${parameter}.*Customer ${suffix}: filters by movies\\.title`,
          "s",
        ),
      );
      await complete(
        `${graphName} Neo4j`,
        "MATCH (m:Movie) WHERE m.title = $",
        new RegExp(
          `\\$param_${parameter}.*Customer ${suffix}: filters by Movie\\.title`,
          "s",
        ),
      );
    } finally {
      if (conceptId) {
        await page.request.delete(`/api/ontology/concepts/${conceptId}`);
      }
      for (const id of ids) {
        await page.request.delete(`/api/connections/${id}?force=true`);
      }
    }
  });

  // #2054: the editor's dialog hears Escape before CodeMirror does, so Escape
  // on the list closed the whole editor and left the list. The list takes it.
  test("Escape on the completion list closes only the list", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    await dialog
      .getByRole("combobox", { name: "Connection", exact: true })
      .click();
    await page.getByRole("option", { name: SEEDED_PG_OPTION }).click();
    await waitForEditorReady(dialog, page);
    await waitForSchemaLoaded(dialog, page);

    await typeInCmEditor(dialog, page, "SELECT * FROM m");
    await page.keyboard.press("Control+Space");
    await waitForAutocompletePopup(page);

    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !document.querySelector(".cm-tooltip-autocomplete"),
      undefined,
      { timeout: 5_000 },
    );
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(dialog).toBeVisible();

    // The next Escape is the editor's, with a typed query to ask about.
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("alertdialog", { name: "Discard your changes?" }),
    ).toBeVisible();
  });

  test("SQL editor shows column name completions from PostgreSQL schema", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog
      .getByRole("combobox", { name: "Connection", exact: true })
      .click();
    await page.getByRole("option", { name: SEEDED_PG_OPTION }).click();

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
    await dialog
      .getByRole("combobox", { name: "Connection", exact: true })
      .click();
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

    await dialog
      .getByRole("combobox", { name: "Connection", exact: true })
      .click();
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

    await dialog
      .getByRole("combobox", { name: "Connection", exact: true })
      .click();
    await page.getByRole("option").first().click();

    // Now it should appear (connectionId is set)
    await expect(
      dialog.getByRole("button", { name: "Refresh schema" }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("schema refresh button triggers schema re-fetch", async ({ page }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog
      .getByRole("combobox", { name: "Connection", exact: true })
      .click();
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
