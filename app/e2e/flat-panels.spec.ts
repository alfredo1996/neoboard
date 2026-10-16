import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";

// #2219: widgets are flat panels 12 px apart; their actions fade in over the
// header on hover or focus. Built from a purpose-made dashboard so the tile
// size and titles are known (two KPI tiles at 3 of 12 columns, like the demo's
// "Movies" and "Actors").
const KPIS = [
  { id: "k1", title: "Total movies", x: 0 },
  { id: "k2", title: "Active actors", x: 3 },
];

test.describe("Flat panels", () => {
  test.use({ viewport: { width: 834, height: 1112 } });

  let dashboardId = "";
  let cleanup: () => Promise<void> = async () => {};

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const made = await createTestDashboard(page.request, `Panels ${uid()}`);
    dashboardId = made.id;
    cleanup = made.cleanup;
    const res = await page.request.put(`/api/dashboards/${dashboardId}`, {
      data: {
        layoutJson: {
          version: 2,
          pages: [
            {
              id: "p1",
              title: "Main",
              widgets: KPIS.map((k) => ({
                id: k.id,
                chartType: "single-value",
                connectionId: "conn-neo4j-001",
                query: "MATCH (m:Movie) RETURN count(m) AS value",
                settings: { title: k.title },
              })),
              gridLayout: KPIS.map((k) => ({
                i: k.id,
                x: k.x,
                y: 0,
                w: 3,
                h: 3,
              })),
            },
          ],
        },
      },
    });
    expect(res.ok()).toBe(true);
    await page.goto(`/${dashboardId}`);
    await expect(
      page.getByRole("heading", { name: "Total movies", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("at 834 px a KPI title shows in full, with its actions out of the way", async ({
    page,
  }) => {
    for (const { title } of KPIS) {
      const heading = page.getByRole("heading", { name: title, exact: true });
      const clipped = await heading.evaluate(
        (el) => el.scrollWidth > el.clientWidth,
      );
      expect(clipped, `"${title}" is clipped`).toBe(false);
    }
    const card = page.locator("[data-widget-id='k1']");
    const bar = card.getByRole("button", { name: "Fullscreen" }).locator("..");
    await expect(bar).toHaveCSS("opacity", "0");
  });

  test("panels are separate: 12 px apart, each with its own 1 px border and 8 px radius", async ({
    page,
  }) => {
    const a = page.locator("[data-widget-id='k1']");
    const b = page.locator("[data-widget-id='k2']");
    const [boxA, boxB] = [(await a.boundingBox())!, (await b.boundingBox())!];
    expect(boxB.x - (boxA.x + boxA.width)).toBe(12);
    const style = await a.evaluate((el) => {
      const cs = getComputedStyle(el.firstElementChild as Element);
      return {
        border: `${cs.borderTopStyle} ${cs.borderTopWidth}`,
        radius: cs.borderTopLeftRadius,
        shadow: cs.boxShadow,
      };
    });
    expect(style).toEqual({
      border: "solid 1px",
      radius: "8px",
      shadow: "none",
    });
  });

  test("hover or focus reveals the actions on the panel's tint, and are hit once shown", async ({
    page,
  }) => {
    const card = page.locator("[data-widget-id='k1']");
    const panel = card.locator("> div").first();
    const fullscreen = card.getByRole("button", { name: "Fullscreen" });
    const bar = fullscreen.locator("..");
    const hitsButton = () =>
      fullscreen.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.x + r.width / 2,
          r.y + r.height / 2,
        );
        return el.contains(hit);
      });

    await page.mouse.move(0, 0);
    await expect(bar).toHaveCSS("opacity", "0");
    const restBg = await panel.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );

    await card.hover();
    await expect(bar).toHaveCSS("opacity", "1");
    expect(await hitsButton()).toBe(true);
    // The panel tints, and the bar follows it instead of drawing a rectangle.
    await expect(panel).not.toHaveCSS("background-color", restBg);
    const tint = await panel.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    await expect(bar).toHaveCSS("background-color", tint);

    await page.mouse.move(0, 0);
    await expect(bar).toHaveCSS("opacity", "0");
    await fullscreen.focus();
    await expect(bar).toHaveCSS("opacity", "1");
  });

  test("edit mode keeps the same gap, so entering it moves nothing", async ({
    page,
  }) => {
    const top = async () =>
      (await page.locator("[data-widget-id='k1']").boundingBox())!.y;
    const gap = async () => {
      const [a, b] = [
        (await page.locator("[data-widget-id='k1']").boundingBox())!,
        (await page.locator("[data-widget-id='k2']").boundingBox())!,
      ];
      return b.x - (a.x + a.width);
    };
    const [topView, gapView] = [await top(), await gap()];
    await page.goto(`/${dashboardId}/edit`);
    await expect(
      page.getByRole("button", { name: "Drag to reorder" }).first(),
    ).toBeVisible({ timeout: 15_000 });
    // Only the grid's own position math is compared: the header may differ.
    expect(await gap()).toBe(gapView);
    expect(Math.abs((await top()) - topView)).toBeLessThan(80);
  });
});
