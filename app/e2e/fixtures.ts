import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { collectClientCoverage } from "nextcov/playwright";
import { nextcov } from "../playwright.config";
import * as dotenv from "dotenv";
import * as path from "node:path";
import { AuthPage } from "./pages/auth";
import { SidebarPage } from "./pages/sidebar";

// Load test container env vars (quiet suppresses dotenvx tip banners).
dotenv.config({ path: path.resolve(__dirname, "..", ".env.test"), quiet: true });

/** Seed user credentials (from docker/postgres/init.sql). */
export const ALICE = { email: "alice@example.com", password: "password123" };
export const BOB = { email: "bob@example.com", password: "password123" };

/** Dynamic test container URLs. */
export const TEST_NEO4J_BOLT_URL = process.env.TEST_NEO4J_BOLT_URL ?? "bolt://localhost:7687";
export const TEST_PG_PORT = process.env.TEST_PG_PORT ?? "5432";

type Fixtures = {
  authPage: AuthPage;
  sidebarPage: SidebarPage;
  coverage: void;
};

export const test = base.extend<Fixtures>({
  authPage: async ({ page }, use) => {
    await use(new AuthPage(page));
  },
  sidebarPage: async ({ page }, use) => {
    await use(new SidebarPage(page));
  },
  coverage: [
    async ({ page }, use, testInfo) => {
      if (process.env.E2E_COVERAGE !== "1") {
        await use();
        return;
      }
      await collectClientCoverage(page, testInfo, use, nextcov);
    },
    { scope: "test", auto: true },
  ],
});

export { expect };

/**
 * Safely type text into the CodeMirror editor inside a dialog.
 *
 * Uses CM6's `view.dispatch()` API to set text directly — this bypasses the
 * readOnly guard (which only blocks browser input events) and fires
 * `EditorView.updateListener` so `onChange` propagates to React state.
 */
export async function typeInEditor(
  dialog: import("@playwright/test").Locator,
  _page: import("@playwright/test").Page,
  query: string,
) {
  const cmContainer = dialog.locator("[data-testid='codemirror-container']");

  // Wait for CM6 to mount and React to signal writable
  await cmContainer.locator(".cm-editor").waitFor({ state: "visible", timeout: 10_000 });
  await expect(cmContainer).toHaveAttribute("data-readonly", "false", { timeout: 10_000 });

  // Set text via CM6's dispatch API — bypasses readOnly (which only blocks
  // browser input events) and fires updateListener → onChange.
  await cmContainer.evaluate((el, text) => {
    const cmEditor = el.querySelector(".cm-editor") as HTMLElement | null;
    // CM6 stores the EditorView on .cm-editor via cmView.view
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = (cmEditor as any)?.cmView?.view;
    if (!view) throw new Error("CM6 EditorView not found");
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }, query);
}

/**
 * Create an isolated dashboard for a test via the API.
 * Uses `page.request` so it inherits the browser session cookies (must be
 * called after login). Returns the dashboard ID and a cleanup function that
 * deletes the dashboard — call in a `finally` block or `afterEach`.
 */
export async function createTestDashboard(
  request: APIRequestContext,
  name: string,
): Promise<{ id: string; cleanup: () => Promise<void> }> {
  const res = await request.post("/api/dashboards", { data: { name } });
  if (!res.ok()) {
    throw new Error(`Failed to create dashboard "${name}": ${res.status()}`);
  }
  const { id } = await res.json();
  return {
    id,
    cleanup: async () => {
      await request.delete(`/api/dashboards/${id}`);
    },
  };
}
