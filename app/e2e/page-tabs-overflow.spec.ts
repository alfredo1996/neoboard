import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";

const PAGE_COUNT = 17;

/** Markdown widget + grid item for a page — no connection needed. */
function pageWith(index: number) {
  const wid = `w${index}`;
  return {
    id: `p${index}`,
    title: `${index}. Page ${index}`,
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

// Page tabs used to be cut off with no way to reach the last ones (#2221).
test.describe("Page tabs scroll instead of cutting off (#2221)", () => {
  test("at 1440px the last of 17 pages is reachable and selectable", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await authPage.login(ALICE.email, ALICE.password);

    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Tabs ${uid()}`,
    );
    try {
      await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: Array.from({ length: PAGE_COUNT }, (_, i) =>
              pageWith(i + 1),
            ),
          },
        },
      });
      await page.goto(`/${id}`);
      await expect(page.getByText("Content of page 1")).toBeVisible({
        timeout: 15_000,
      });

      // The row overflows, so the edge button shows on the right.
      const right = page.getByRole("button", { name: "Scroll tabs right" });
      await expect(right).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Scroll tabs left" }),
      ).toHaveCount(0);

      // Keyboard: End moves focus to the last tab, Enter opens it.
      await page
        .getByRole("tab", { name: "1. Page 1", selected: true })
        .focus();
      await page.keyboard.press("End");
      await expect(
        page.getByRole("tab", { name: "17. Page 17" }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("tab", { name: "17. Page 17", selected: true }),
      ).toBeInViewport({ ratio: 1 });
      await expect(page.getByText("Content of page 17")).toBeVisible();

      // Now the left button shows and brings the first tab back.
      const left = page.getByRole("button", { name: "Scroll tabs left" });
      await expect(left).toBeVisible();
      await expect(right).toHaveCount(0);
      // One press scrolls back about 70% of the row: the right button returns.
      await left.click();
      await expect(right).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test("a dashboard opening on page 16 scrolls that tab into view", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Tabs ${uid()}`,
    );
    try {
      await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: Array.from({ length: PAGE_COUNT }, (_, i) =>
              pageWith(i + 1),
            ),
          },
        },
      });
      await page.goto(`/${id}?page=15`);
      await expect(page.getByText("Content of page 16")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.getByRole("tab", { name: "16. Page 16", selected: true }),
      ).toBeInViewport({ ratio: 1 });
    } finally {
      await cleanup();
    }
  });
  test("in edit mode dragging a tab reorders and never opens the dragged page", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Tabs ${uid()}`,
    );
    try {
      await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [1, 2, 3].map(pageWith),
          },
        },
      });
      await page.goto(`/${id}/edit`);
      await expect(page.getByText("Content of page 1")).toBeVisible({
        timeout: 15_000,
      });

      await page
        .getByRole("tab", { name: "3. Page 3" })
        .dragTo(page.getByRole("tab", { name: "1. Page 1" }));

      // Reordered: page 3 now sits first. Page 1 is still the open page.
      await expect(page.getByRole("tab").first()).toHaveText("3. Page 3");
      await expect(
        page.getByRole("tab", { name: "1. Page 1", selected: true }),
      ).toBeVisible();
      await expect(page.getByText("Content of page 1")).toBeVisible();
    } finally {
      await cleanup();
    }
  });
});
