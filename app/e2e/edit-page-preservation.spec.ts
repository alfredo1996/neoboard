import { test, expect, ALICE, createTestDashboard } from "./fixtures";

/** Markdown widget + grid item for a page — no connection needed. */
function pageWith(index: number) {
  const wid = `w${index}`;
  return {
    id: `p${index}`,
    title: `Page ${index}`,
    widgets: [
      {
        id: wid,
        chartType: "markdown",
        connectionId: "",
        query: "",
        settings: {
          title: `Widget ${index}`,
          chartOptions: { content: `## Content of page ${index}` },
        },
      },
    ],
    gridLayout: [{ i: wid, x: 0, y: 0, w: 6, h: 4 }],
  };
}

// Leaving edit mode used to drop the page you were on and land you back on
// page 1 (#1371): the view route kept its page index in local component state
// and the exit navigation carried no ?page=. The dashboard store now owns the
// index and the [id] layout survives the toggle, so it persists both ways.
test.describe("Edit mode preserves the active page (#1371)", () => {
  test("round-trips a non-zero page through edit mode and clamps a bad ?page=", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(90_000);
    await authPage.login(ALICE.email, ALICE.password);

    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Pages ${Date.now()}`,
    );
    try {
      await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [1, 2, 3, 4].map(pageWith),
          },
        },
      });

      await page.goto(`/${id}`);
      await expect(page.getByText("Content of page 1")).toBeVisible({
        timeout: 15_000,
      });

      // ── Select page 3 ───────────────────────────────────────────────
      await page.getByRole("tab", { name: "Page 3" }).click();
      await expect(page.getByText("Content of page 3")).toBeVisible();

      // ── Into edit mode ──────────────────────────────────────────────
      await page.keyboard.press("Meta+e");
      await page.waitForURL(/\/edit/, { timeout: 15_000 });
      // The mode is read off the URL segment by [id]/layout.tsx — assert the
      // edit chrome actually appeared, not just that the URL changed.
      await expect(
        page.getByRole("button", { name: /Add Widget/ }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole("tab", { name: "Page 3", selected: true }),
      ).toBeVisible({ timeout: 15_000 });

      // ── Back out of edit mode — this is the reported bug ────────────
      await page.keyboard.press("Meta+e");
      await page.waitForURL((url) => !url.pathname.endsWith("/edit"), {
        timeout: 15_000,
      });
      await expect(page.getByRole("button", { name: /^Edit/ })).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.getByRole("tab", { name: "Page 3", selected: true }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Content of page 3")).toBeVisible();

      // ── The last page round-trips too ───────────────────────────────
      await page.getByRole("tab", { name: "Page 4" }).click();
      await page.keyboard.press("Meta+e");
      await page.waitForURL(/\/edit/, { timeout: 15_000 });
      await page.keyboard.press("Meta+e");
      await page.waitForURL((url) => !url.pathname.endsWith("/edit"), {
        timeout: 15_000,
      });
      await expect(
        page.getByRole("tab", { name: "Page 4", selected: true }),
      ).toBeVisible({ timeout: 15_000 });

      // ── A malformed ?page= must clamp, not render a blank grid ──────
      for (const bad of ["-1", "abc", "99"]) {
        await page.goto(`/${id}/edit?page=${bad}`);
        await expect(
          page.getByRole("tab", { selected: true }),
          `?page=${bad} left no page selected`,
        ).toBeVisible({ timeout: 15_000 });
        await expect(
          page.locator('[data-testid="widget-card"]').first(),
          `?page=${bad} rendered a blank dashboard`,
        ).toBeVisible({ timeout: 15_000 });
      }

      // -1 and abc both mean "first page"; 99 clamps to the last.
      await page.goto(`/${id}/edit?page=-1`);
      await expect(
        page.getByRole("tab", { name: "Page 1", selected: true }),
      ).toBeVisible({ timeout: 15_000 });
      await page.goto(`/${id}/edit?page=abc`);
      await expect(
        page.getByRole("tab", { name: "Page 1", selected: true }),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await cleanup();
    }
  });
});
