import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  editingCrumb,
  uid,
} from "./fixtures";

// The page header keeps its height from view to edit mode (#2252). Entering
// edit mode moved the content by up to 144px at 834px wide before: the title
// grew an "Editing:" prefix and wrapped, the tabs row appeared on a one-page
// dashboard, and the actions wrapped under the title.

const LONG_NAME =
  "Scroll position dashboard with a deliberately long name that no header should wrap";

async function seed(
  request: import("@playwright/test").APIRequestContext,
  pages: number,
) {
  const { id, cleanup } = await createTestDashboard(
    request,
    `${LONG_NAME} ${uid()}`,
  );
  const layoutPages = Array.from({ length: pages }, (_, p) => ({
    id: `p${p}`,
    title: `Page ${p + 1}`,
    widgets: [
      {
        id: `p${p}w0`,
        chartType: "markdown",
        connectionId: "",
        query: "",
        settings: { title: "Notes", chartOptions: { content: "## Notes" } },
      },
    ],
    gridLayout: [{ i: `p${p}w0`, x: 0, y: 0, w: 12, h: 5 }],
  }));
  const res = await request.put(`/api/dashboards/${id}`, {
    data: { layoutJson: { version: 2, pages: layoutPages } },
  });
  expect(res.ok()).toBe(true);
  return { id, cleanup };
}

const geometry = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const header = document.querySelector("main header");
    const card = document.querySelector('[data-testid="widget-card"]');
    const h1 = header?.querySelector("h1");
    if (!header || !card || !h1) return null;
    const bottom = header.getBoundingClientRect().bottom;
    return {
      height: header.getBoundingClientRect().height,
      gridGap: card.getBoundingClientRect().top - bottom,
      titleHeight: h1.getBoundingClientRect().height,
      titleClipped: h1.scrollWidth > h1.clientWidth,
    };
  });

for (const width of [1280, 1024, 834, 768]) {
  for (const pages of [1, 2]) {
    test(`header height and grid position match in view and edit: ${width}px, ${pages} page(s)`, async ({
      authPage,
      page,
    }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 1024 });
      await authPage.login(ALICE.email, ALICE.password);
      const { id, cleanup } = await seed(page.request, pages);
      try {
        await page.goto(`/${id}`);
        await expect(page.getByText("Notes").first()).toBeVisible({
          timeout: 15_000,
        });
        const view = await geometry(page);

        await page.getByRole("button", { name: "Edit", exact: true }).click();
        await expect(editingCrumb(page)).toBeVisible({ timeout: 15_000 });
        await expect(
          page.getByRole("button", { name: "Drag to reorder" }).first(),
        ).toBeVisible({ timeout: 15_000 });
        const edit = await geometry(page);

        expect(view).not.toBeNull();
        expect(edit).not.toBeNull();
        // One line of title in both, however long the name.
        expect(view!.titleClipped).toBe(true);
        expect(edit!.titleHeight).toBe(view!.titleHeight);
        expect(edit!.height).toBeCloseTo(view!.height, 0);
        expect(edit!.gridGap).toBeCloseTo(view!.gridGap, 0);
        console.log(
          `HEADER ${width}px ${pages}p view=${view!.height} edit=${edit!.height}`,
        );
      } finally {
        await cleanup();
      }
    });
  }
}
