import { test, expect, ALICE, typeInEditor } from "./fixtures";

/**
 * #1374 — query editor maximize toggle.
 *
 * Both the issue and its stated mechanism are wrong about *why* the editor feels
 * cramped, and these measurements are the record of it (1280x720):
 *
 *   empty / 3 lines  → 173px surface, no internal scroll
 *   30 lines         → 627px surface, no internal scroll
 *   120 lines        → 2391px surface, no internal scroll
 *
 * The editor is neither capped nor starved — it has NO definite height, because
 * `.cm-editor { height: 100% }` resolves against an indefinite-height flex
 * parent and therefore computes to `auto`. So it grows without bound with the
 * document, and what actually scrolls is the whole left settings column (the Run
 * toolbar, tabs and chart selectors scroll away with it). The preview never
 * competed for that space either: the modal body is a two-column grid, so the
 * panes are side by side.
 *
 * Maximizing therefore delivers two things, and the tests below measure each
 * separately rather than asserting one blanket "bigger":
 *   1. On open (the short-query case) a definite 70vh height — a real, measured
 *      height gain of >2x over the 220px minimum.
 *   2. On a long query, full modal width plus scrolling moved INTO the editor
 *      with its toolbar pinned. Height cannot grow here: at 720px the modal body
 *      is capped at calc(90vh - 180px) = 468px, so ~457px is the ceiling any
 *      toggle can offer. That ceiling is the modal itself (issue option (c)).
 */

/** Reads the live CM6 doc length — proves the view survived the toggle. */
function docLength(editor: import("@playwright/test").Locator) {
  return editor.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (el: HTMLElement) => (el as any).__cmView?.state.doc.length ?? -1,
  );
}

/** Internal scroll state of the CodeMirror scroller. */
function scrollState(editor: import("@playwright/test").Locator) {
  return editor.evaluate((el: HTMLElement) => {
    const s = el.querySelector<HTMLElement>(".cm-scroller");
    return {
      scrollHeight: s?.scrollHeight ?? -1,
      clientHeight: s?.clientHeight ?? -1,
    };
  });
}

const LONG_QUERY = Array.from(
  { length: 120 },
  (_, i) => `// line ${i + 1} of a query that does not fit in one screen`,
).join("\n");

test.describe("Query editor maximize (#1374)", () => {
  test.beforeEach(async ({ authPage, page }) => {
    // A short laptop viewport — the height where the modal budget is tightest.
    await page.setViewportSize({ width: 1280, height: 720 });
    await authPage.login(ALICE.email, ALICE.password);

    await page.getByRole("button", { name: /New Dashboard/i }).click();
    const create = page.getByRole("dialog", { name: "Create Dashboard" });
    await create.locator("#dashboard-name").fill("Editor Maximize Test");
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/dashboards") &&
          r.request().method() === "POST" &&
          r.status() === 201,
        { timeout: 10_000 },
      ),
      create.getByRole("button", { name: "Create" }).click(),
    ]);
    await page.waitForURL(/\/edit/, { timeout: 15_000 });
    await expect(page.getByText("Editing:")).toBeVisible();

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    await dialog.getByRole("combobox").nth(0).click();
    await page.getByRole("option").first().click();
  });

  test("more than doubles the editor height on open and unmounts the preview", async ({
    page,
  }) => {
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    const editor = dialog.locator("[data-testid='codemirror-container']");
    const preview = dialog.locator("[data-testid='widget-preview']");
    const cancel = dialog.getByRole("button", { name: "Cancel" });
    const save = dialog.getByRole("button", { name: "Add Widget" });

    await typeInEditor(dialog, page, "MATCH (n)\nRETURN n\nLIMIT 10");

    // ── Collapsed baseline ────────────────────────────────────────────
    await expect(preview).toBeVisible();
    const collapsed = (await editor.boundingBox())!;
    expect(collapsed.height).toBeGreaterThan(0);
    await expect(cancel).toBeInViewport();
    await expect(save).toBeInViewport();

    // ── Maximize ──────────────────────────────────────────────────────
    await dialog.getByRole("button", { name: "Expand editor" }).click();

    // Unmounted, not merely hidden — chart/graph renderers must re-measure from
    // scratch rather than wake up at 0x0.
    await expect(preview).toHaveCount(0);

    const maximized = (await editor.boundingBox())!;
    // eslint-disable-next-line no-console
    console.log(
      `[#1374] short query — height ${collapsed.height}px → ${maximized.height}px ` +
        `(${(maximized.height / collapsed.height).toFixed(2)}x), ` +
        `width ${collapsed.width}px → ${maximized.width}px, viewport 1280x720`,
    );
    expect(maximized.height).toBeGreaterThanOrEqual(collapsed.height * 2);
    expect(maximized.width).toBeGreaterThan(collapsed.width);

    // #1041 must not regress: the body scrolls, the footer stays pinned.
    await expect(cancel).toBeInViewport();
    await expect(save).toBeInViewport();

    // Classes changed, tree did not — CodeMirror must not have remounted, or the
    // user loses cursor position and undo history on every toggle.
    expect(await docLength(editor)).toBe(
      "MATCH (n)\nRETURN n\nLIMIT 10".length,
    );

    // ── Restore ───────────────────────────────────────────────────────
    await dialog.getByRole("button", { name: "Collapse editor" }).click();
    await expect(preview).toBeVisible();
    const restored = (await editor.boundingBox())!;
    expect(Math.abs(restored.height - collapsed.height)).toBeLessThan(2);
    expect(Math.abs(restored.width - collapsed.width)).toBeLessThan(2);
    expect(await docLength(editor)).toBe(
      "MATCH (n)\nRETURN n\nLIMIT 10".length,
    );
    await expect(cancel).toBeInViewport();
    await expect(save).toBeInViewport();
  });

  test("moves a long query's scrolling into the editor and widens it", async ({
    page,
  }) => {
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    const editor = dialog.locator("[data-testid='codemirror-container']");
    const cancel = dialog.getByRole("button", { name: "Cancel" });
    const save = dialog.getByRole("button", { name: "Add Widget" });

    await typeInEditor(dialog, page, LONG_QUERY);

    // Collapsed: the editor has grown past the modal, so it does NOT scroll
    // itself — the settings column does, dragging the toolbar out of view.
    const collapsed = (await editor.boundingBox())!;
    const collapsedScroll = await scrollState(editor);
    expect(collapsedScroll.scrollHeight).toBeLessThanOrEqual(
      collapsedScroll.clientHeight + 1,
    );

    await dialog.getByRole("button", { name: "Expand editor" }).click();

    const maximized = (await editor.boundingBox())!;
    const maximizedScroll = await scrollState(editor);
    // eslint-disable-next-line no-console
    console.log(
      `[#1374] 120-line query — height ${collapsed.height}px → ${maximized.height}px, ` +
        `width ${collapsed.width}px → ${maximized.width}px, ` +
        `internal scroll ${collapsedScroll.scrollHeight}/${collapsedScroll.clientHeight} → ` +
        `${maximizedScroll.scrollHeight}/${maximizedScroll.clientHeight}, viewport 1280x720`,
    );

    // The win here is width plus a self-scrolling editor with a pinned toolbar.
    // Height cannot grow: calc(90vh - 180px) = 468px is the modal's own ceiling.
    expect(maximized.width).toBeGreaterThan(collapsed.width);
    expect(maximizedScroll.scrollHeight).toBeGreaterThan(
      maximizedScroll.clientHeight,
    );
    // Still a usable window, not squeezed back to the bare minimum.
    expect(maximized.height).toBeGreaterThan(350);

    await expect(cancel).toBeInViewport();
    await expect(save).toBeInViewport();
    expect(await docLength(editor)).toBe(LONG_QUERY.length);
  });
});
