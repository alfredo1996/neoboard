import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { collectClientCoverage } from "nextcov/playwright";
import { nextcov } from "../playwright.config";
import * as dotenv from "dotenv";
import * as path from "node:path";
import { AuthPage } from "./pages/auth";
import { SidebarPage } from "./pages/sidebar";

// Load test container env vars (quiet suppresses dotenvx tip banners).
dotenv.config({
  path: path.resolve(__dirname, "..", ".env.test"),
  quiet: true,
});

/** Seed user credentials (from docker/postgres/init.sql). */
export const ALICE = { email: "alice@example.com", password: "password123" };
export const BOB = { email: "bob@example.com", password: "password123" };

/** Dynamic test container URLs. */
export const TEST_NEO4J_BOLT_URL =
  process.env.TEST_NEO4J_BOLT_URL ?? "bolt://localhost:7687";
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
/**
 * Type text into the CodeMirror editor inside a dialog.
 *
 * Waits for `data-cm-readonly="false"` — the actual CM6 readOnly state
 * exposed by QueryEditor in the same synchronous turn as the compartment
 * reconfigure. This eliminates the async race between the React prop and
 * the CM6 state that caused persistent flakes on CI.
 */
export async function typeInEditor(
  dialog: import("@playwright/test").Locator,
  _page: import("@playwright/test").Page,
  query: string,
) {
  const cmContainer = dialog.locator("[data-testid='codemirror-container']");

  await expect(async () => {
    // Wait for editor to be fully initialized and writable at the CM6 level
    await expect(cmContainer).toHaveAttribute("data-editor-ready", "true", {
      timeout: 5_000,
    });
    await expect(cmContainer).toHaveAttribute("data-cm-readonly", "false", {
      timeout: 5_000,
    });

    // Dispatch text replacement via CM6 API
    const result = await cmContainer.evaluate(
      (el: HTMLElement, text: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const view = (el as any).__cmView;
        if (!view) return "no-view";
        if (view.state.readOnly) return "readonly";
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
        });
        return view.state.doc.toString().includes(text.substring(0, 20))
          ? "ok"
          : "dispatch-failed";
      },
      query,
    );

    if (result !== "ok") {
      throw new Error(`CM6 dispatch: ${result} — retrying`);
    }
  }).toPass({ timeout: 30_000 });
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
  const { id } = (await res.json()).data;
  return {
    id,
    cleanup: async () => {
      await request.delete(`/api/dashboards/${id}`);
    },
  };
}
