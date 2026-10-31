import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  typeInEditor,
  uid,
  editingCrumb,
} from "./fixtures";

/**
 * #1374 — query editor maximize toggle.
 *
 * Collapsed, the query box grows with its text to 320px and then scrolls inside
 * itself; the pane around it is the one other scroller (#2388). Maximizing
 * unmounts the preview and gives the box the full width and half the viewport's
 * height. The tests below measure each separately rather than asserting one
 * blanket "bigger":
 *   1. A short query: 120px collapsed, half the viewport (360px at 720) expanded.
 *   2. A long query: scrolling stays inside the editor in both states, and the
 *      expanded box is wider and taller.
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
  // Each test's own dashboard, deleted by id afterwards (#1784).
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.afterEach(async () => {
    await dashboardCleanup?.();
    dashboardCleanup = undefined;
  });

  test.beforeEach(async ({ authPage, page }) => {
    // A short laptop viewport — the height where the modal budget is tightest.
    await page.setViewportSize({ width: 1280, height: 720 });
    await authPage.login(ALICE.email, ALICE.password);

    const name = `Editor Maximize ${uid()}`;
    const { id, cleanup } = await createTestDashboard(page.request, name);
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(editingCrumb(page)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });
    await dialog
      .getByRole("combobox", { name: "Connection", exact: true })
      .click();
    await page.getByRole("option").first().click();
  });

  test("the query pane follows the theme and fills its frame (#2329)", async ({
    page,
  }) => {
    const dialog = page.getByRole("dialog", {
      name: "Add Widget",
      exact: true,
    });
    const frame = dialog.locator("[data-testid='codemirror-container']");
    const cm = frame.locator(".cm-editor");
    await expect(frame).toHaveAttribute("data-editor-ready", "true");
    const bg = () => cm.evaluate((el) => getComputedStyle(el).backgroundColor);
    // The dialog's own field colour, resolved by the browser from the token.
    const field = () =>
      cm.evaluate((el) => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = "hsl(var(--field))";
        el.parentElement?.appendChild(probe);
        const c = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return c;
      });
    const setDark = (on: boolean) =>
      page.evaluate(
        (d) => document.documentElement.classList.toggle("dark", d),
        on,
      );

    await setDark(false);
    const light = await field();
    await expect.poll(bg).toBe(light);
    await setDark(true);
    const dark = await field();
    expect(dark).not.toBe(light);
    await expect.poll(bg).toBe(dark);
    await setDark(false);
    await expect.poll(bg).toBe(light);

    // Empty query: no band between the code and the frame's bottom edge.
    const [frameBox, cmBox] = [
      await frame.boundingBox(),
      await cm.boundingBox(),
    ];
    expect(Math.abs(frameBox!.height - cmBox!.height)).toBeLessThanOrEqual(1);
  });

  test("the query editor is a textbox named by its Query heading (#2345)", async ({
    page,
  }) => {
    const dialog = page.getByRole("dialog", {
      name: "Add Widget",
      exact: true,
    });
    await expect(
      dialog.getByRole("textbox", { name: "Query", exact: true }),
    ).toBeVisible();
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

    // Collapsed: the box stops growing at 320px and scrolls inside itself; the
    // pane around it is the only other scroller (#2388).
    const collapsed = (await editor.boundingBox())!;
    const collapsedScroll = await scrollState(editor);
    expect(collapsed.height).toBeLessThanOrEqual(321);
    expect(collapsedScroll.scrollHeight).toBeGreaterThan(
      collapsedScroll.clientHeight,
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
