import { test, expect, ALICE, createTestDashboard } from "./fixtures";
import type { Page } from "@playwright/test";

test.describe("Dashboard grid", () => {
  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.getByText("Movie Analytics", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10000 });
  });

  test("view mode should not show drag handles", async ({ page }) => {
    // In view mode, react-grid-layout items should not be draggable
    const dragHandle = page.locator(".react-grid-item.react-draggable");
    await expect(dragHandle).toHaveCount(0);
  });

  test("edit mode should allow drag and resize", async ({ page }) => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: /^Editing:/ }),
    ).toBeVisible();

    // In edit mode, grid items should have draggable class
    const gridItem = page.locator(".react-grid-item").first();
    await expect(gridItem).toBeVisible({ timeout: 5000 });

    // Resize handle should be visible in edit mode
    const resizeHandle = page.locator(".react-resizable-handle").first();
    await expect(resizeHandle).toBeVisible();
  });

  test("resizing the window in edit mode does not dirty the dashboard", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Editing:/ })).toBeVisible({
      timeout: 10000,
    });

    // Pure responsive reflow across breakpoints — no user drag/resize.
    await page.setViewportSize({ width: 900, height: 1024 });
    await page.setViewportSize({ width: 700, height: 1024 });
    await page.setViewportSize({ width: 1280, height: 1024 });

    // Because a reflow is not a user edit, leaving via Back must navigate
    // straight to view mode — no unsaved-changes confirmation dialog.
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Editing:/ })).toBeHidden({
      timeout: 10000,
    });
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }),
    ).toBeVisible();
  });

  test("should save layout changes", async ({ page }) => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Editing:/ })).toBeVisible({
      timeout: 10000,
    });

    // Click Save and verify the button is present and clickable
    const saveButton = page.getByRole("button", { name: "Save" });
    await expect(saveButton).toBeVisible();
    await saveButton.click();
    // Verify the save button returns to normal state (not stuck in loading)
    await expect(saveButton).toBeEnabled({ timeout: 10000 });
  });
});

/**
 * #1375 — a save on a narrow window permanently squashed the layout.
 *
 * One layout is stored per page, so the grid has to use one column count at
 * every breakpoint. When it used four (lg:12, md:10, sm:6, xs:4), the grid
 * clamped every item into the narrower count below `lg`, `onDragStop` handed
 * that clamped layout back, and it was persisted as THE layout.
 *
 * Two things this test has to get right, both learned by writing tests that
 * could not fail:
 *
 * 1. **Assert position, not width.** Clamping keeps `w` and moves `x` — a
 *    `w:6,x:6`-of-12 item becomes `w:6,x:4`-of-10 — so items overlap and the
 *    vertical compactor stacks them. Width is also blind by construction: the
 *    stored layout and the breakpoint rendering it shrink together, so a
 *    `6-of-12` item saved as `6-of-10` measures the same in pixels.
 *
 * 2. **Measure at a wide window.** The damage is only visible where the
 *    authored 12 columns are actually rendered as 12.
 *
 * The seeded dashboards are effectively single-column and cannot exhibit the
 * symptom at all, hence the purpose-built two-up fixture.
 */
test.describe("Grid layout survives a save on a narrow window (#1375)", () => {
  // Container = viewport − sidebar (192) − page padding (48), so 1600 gives
  // ~1360 (at or above the lg breakpoint of 1200) and 1280 gives ~1040 (below
  // it). Both are asserted below rather than assumed.
  const WIDE = { width: 1600, height: 1000 };
  const NARROW = { width: 1280, height: 1000 };

  const item = (page: Page, id: string) =>
    page.locator(`[data-widget-id="${id}"]`);

  async function openEditor(page: Page, id: string) {
    await page.goto(`/${id}/edit`);
    await expect(item(page, "left")).toBeVisible({ timeout: 15_000 });
    await expect(item(page, "right")).toBeVisible();
  }

  /** Width the grid measured for its column maths — what picks the breakpoint. */
  const gridWidth = (page: Page) =>
    item(page, "left").evaluate((el) => el.parentElement?.clientWidth ?? -1);

  /** Both widgets on one row, side by side — the authored arrangement. */
  async function expectSideBySide(page: Page, when: string) {
    await expect(async () => {
      const left = await item(page, "left").boundingBox();
      const right = await item(page, "right").boundingBox();
      const where = `${when}: left=${JSON.stringify(left)} right=${JSON.stringify(right)}`;
      expect(left && right, where).toBeTruthy();
      // Same row: a stacked pair differs by a full widget height (h:4 = 320px).
      expect(
        Math.abs(left!.y - right!.y),
        `not on one row — ${where}`,
      ).toBeLessThan(8);
      // And genuinely in different columns, not overlapping.
      expect(right!.x, `not side by side — ${where}`).toBeGreaterThan(
        left!.x + left!.width / 2,
      );
    }).toPass({ timeout: 10_000 });
  }

  test("a drag saved below the lg breakpoint keeps the authored columns", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(90_000);
    await authPage.login(ALICE.email, ALICE.password);

    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Grid parity ${Date.now()}`,
    );
    try {
      // Two markdown widgets (no connection needed) filling one 12-column row.
      const seed = await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [
              {
                id: "p1",
                title: "Main",
                widgets: ["left", "right"].map((side) => ({
                  id: side,
                  chartType: "markdown",
                  connectionId: "",
                  query: "",
                  settings: {
                    title: side,
                    chartOptions: { content: `## ${side}` },
                  },
                })),
                gridLayout: [
                  { i: "left", x: 0, y: 0, w: 6, h: 4 },
                  { i: "right", x: 6, y: 0, w: 6, h: 4 },
                ],
              },
            ],
          },
        },
      });
      expect(seed.ok(), `seeding the layout failed: ${seed.status()}`).toBe(
        true,
      );

      // ── Before: at a wide window the fixture really is two-up. Without this
      // the whole test would pass vacuously on a single-column dashboard.
      await page.setViewportSize(WIDE);
      await openEditor(page, id);
      expect(
        await gridWidth(page),
        "wide window must render at the lg breakpoint",
      ).toBeGreaterThanOrEqual(1200);
      await expectSideBySide(page, "before the narrow save");

      // ── A real user drag, then a save, on a window below lg.
      await page.setViewportSize(NARROW);
      await openEditor(page, id);
      expect(
        await gridWidth(page),
        "narrow window must render below the lg breakpoint",
      ).toBeLessThan(1200);

      // Nudge the left widget by less than half a column so the drag registers
      // (threshold is 3px) without intentionally moving anything: any layout
      // change from here is the grid's own doing, not the user's.
      const handle = item(page, "left").locator(".drag-handle");
      const grip = (await handle.boundingBox())!;
      const [cx, cy] = [grip.x + grip.width / 2, grip.y + grip.height / 2];
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 12, cy, { steps: 6 });
      await page.mouse.up();

      const saved = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/dashboards/${id}`) &&
          r.request().method() === "PUT",
      );
      await page.getByRole("button", { name: "Save" }).click();
      expect((await saved).ok(), "the save request failed").toBe(true);

      // ── After: the stored layout must still be the authored one.
      await page.setViewportSize(WIDE);
      await openEditor(page, id);
      await expectSideBySide(page, "after the narrow save");
    } finally {
      await cleanup();
    }
  });
});
