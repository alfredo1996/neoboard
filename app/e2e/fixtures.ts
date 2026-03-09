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

/** Locate the widget preview panel inside a dialog by its stable data-testid. */
export function getPreview(dialog: import("@playwright/test").Locator) {
  return dialog.getByTestId("widget-preview");
}

/**
 * Safely type text into the CodeMirror editor inside a dialog.
 *
 * Uses CM6's `view.dispatch()` API via `page.evaluate()` to bypass the
 * contenteditable layer entirely. This eliminates the race where React's
 * `data-readonly` and the DOM's `contenteditable` both show "writable"
 * but CM6's internal EditorState readonly compartment hasn't reconfigured
 * yet, causing `keyboard.insertText()` to be silently dropped.
 *
 * Falls back to keyboard insertion if the CM6 view is not accessible
 * (e.g. in production builds where `cmView` may be inaccessible).
 */
export async function typeInEditor(
  dialog: import("@playwright/test").Locator,
  page: import("@playwright/test").Page,
  query: string,
) {
  const cmContainer = dialog.locator("[data-testid='codemirror-container']");
  const cm = cmContainer.locator(".cm-content");

  // Retry until text is successfully inserted via CM6 dispatch or keyboard fallback.
  // All waits are inside the retry loop to handle chart-type changes that
  // destroy and recreate the CM6 editor mid-flow.
  await expect(async () => {
    // Wait for CM6 to mount (re-checked each iteration in case of remount)
    await cmContainer.locator(".cm-editor").waitFor({ state: "visible", timeout: 5_000 });

    // Wait for the React wrapper to signal writable
    await expect(cmContainer).toHaveAttribute("data-readonly", "false", { timeout: 5_000 });

    // Wait for initEditor to complete (view + compartments fully initialized).
    // This prevents the race where data-readonly is "false" but the CM6 view
    // hasn't been created yet because async imports are still in progress.
    await expect(cmContainer).toHaveAttribute("data-editor-ready", "true", { timeout: 5_000 });

    // Strategy 1: Use CM6's internal dispatch API (most reliable).
    // In CM6 v6.x, each DOM node managed by the editor has a `cmTile`
    // property (Tile instance). The `.cm-content` element's cmTile is a
    // DocTile whose `.root.view` yields the EditorView. This mirrors the
    // logic of the static `EditorView.findFromDOM()` method.
    const dispatched = await cmContainer.evaluate((el: HTMLElement, text: string) => {
      const cmContent = el.querySelector(".cm-content");
      if (!cmContent) return "no-editor";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tile = (cmContent as any).cmTile;
      const view = tile?.root?.view ?? tile?.view;
      if (!view) return "no-view";
      if (view.state.readOnly) return "readonly";

      // Replace entire document content
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
      return view.state.doc.toString().includes(text.substring(0, 20))
        ? "ok"
        : "dispatch-failed";
    }, query);

    if (dispatched === "ok") return;

    // Strategy 2: Keyboard fallback (for environments where cmView is not accessible)
    if (dispatched === "no-view") {
      await expect(cm).toHaveAttribute("contenteditable", "true", { timeout: 2_000 });
      await cm.click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.press("Backspace");
      await page.keyboard.insertText(query);
      const text = await cm.textContent();
      if (!text || !text.includes(query.substring(0, 20))) {
        throw new Error("Keyboard fallback: text not inserted");
      }
      return;
    }

    // Retry-worthy states: no-editor, readonly, dispatch-failed
    throw new Error(`CM6 dispatch returned "${dispatched}" — retrying`);
  }).toPass({ timeout: 20_000 });
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
