import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";

// #2247: widgets are BI cards 12 px apart (a white card, a visible edge, a
// light shadow and a header rule, on a grey page); their actions fade in over
// the header on hover or focus. Built from a purpose-made dashboard so the tile
// size and titles are known (two KPI tiles at 3 of 12 columns, like the demo's
// "Movies" and "Actors").
const KPIS = [
  { id: "k1", title: "Total movies", x: 0 },
  { id: "k2", title: "Active actors", x: 3 },
];

test.describe("Widget cards", () => {
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

  test("cards are separate: 12 px apart, each with a 1 px edge, an 8 px radius and a shadow", async ({
    page,
  }) => {
    const a = page.locator("[data-widget-id='k1']");
    const b = page.locator("[data-widget-id='k2']");
    const [boxA, boxB] = [(await a.boundingBox())!, (await b.boundingBox())!];
    expect(boxB.x - (boxA.x + boxA.width)).toBe(12);
    const style = await a.evaluate((el) => {
      const cs = getComputedStyle(el.firstElementChild as Element);
      const hd = getComputedStyle(
        el.querySelector("[data-widget-header]") as Element,
      );
      return {
        border: `${cs.borderTopStyle} ${cs.borderTopWidth}`,
        radius: cs.borderTopLeftRadius,
        shadowLayers: (cs.boxShadow.match(/rgba?\((?!0, 0, 0, 0\))/g) ?? [])
          .length,
        rule: `${hd.borderBottomStyle} ${hd.borderBottomWidth}`,
        titleFont: getComputedStyle(
          el.querySelector("h3") as Element,
        ).fontFamily.toLowerCase(),
      };
    });
    expect(style).toMatchObject({
      border: "solid 1px",
      radius: "8px",
      shadowLayers: 2,
      rule: "solid 1px",
    });
    // Titles are sans (IBM Plex Sans), not the serif.
    expect(style.titleFont).toContain("plex sans");
    expect(style.titleFont).not.toContain("source serif");
  });

  test("hover or focus reveals the actions and darkens the edge; the fill stays", async ({
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
    const look = () =>
      panel.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { fill: cs.backgroundColor, edge: cs.borderTopColor };
      });

    await page.mouse.move(0, 0);
    await expect(bar).toHaveCSS("opacity", "0");
    const rest = await look();

    await card.hover();
    await expect(bar).toHaveCSS("opacity", "1");
    expect(await hitsButton()).toBe(true);
    await expect(panel).not.toHaveCSS("border-top-color", rest.edge);
    expect((await look()).fill).toBe(rest.fill);

    await page.mouse.move(0, 0);
    await expect(bar).toHaveCSS("opacity", "0");
    await fullscreen.focus();
    await expect(bar).toHaveCSS("opacity", "1");
    await expect(panel).not.toHaveCSS("border-top-color", rest.edge);
  });

  test("edit mode keeps the same gap, so entering it moves nothing", async ({
    page,
  }) => {
    // The grid's top against the header's bottom edge: the header is the same
    // height in both modes (#2252), so this does not move at all.
    const belowHeader = async () => {
      const [header, card] = [
        (await page.locator("main header").boundingBox())!,
        (await page.locator("[data-widget-id='k1']").boundingBox())!,
      ];
      return card.y - (header.y + header.height);
    };
    const gap = async () => {
      const [a, b] = [
        (await page.locator("[data-widget-id='k1']").boundingBox())!,
        (await page.locator("[data-widget-id='k2']").boundingBox())!,
      ];
      return b.x - (a.x + a.width);
    };
    const [belowView, gapView] = [await belowHeader(), await gap()];
    await page.goto(`/${dashboardId}/edit`);
    await expect(
      page.getByRole("button", { name: "Drag to reorder" }).first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(await gap()).toBe(gapView);
    expect(await belowHeader()).toBeCloseTo(belowView, 1);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`the card reads against the page ground: fill, edge and shadow (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await expect(page.locator("html")).toHaveClass(
        scheme === "dark" ? /dark/ : /^((?!dark).)*$/,
      );
      const read = (sel: string, prop: "backgroundColor" | "borderTopColor") =>
        page
          .locator(sel)
          .first()
          .evaluate((el, p) => getComputedStyle(el)[p], prop);
      const panel = "[data-widget-id='k1'] > div";
      await page.mouse.move(0, 0);
      const ground = await read(
        "[data-testid='dashboard-ground']",
        "backgroundColor",
      );
      const fill = await read(panel, "backgroundColor");
      const edge = await read(panel, "borderTopColor");
      expect(ground, "ground vs card").not.toBe(fill);
      expect(edge, "edge vs ground").not.toBe(ground);
      expect(edge, "edge vs card").not.toBe(fill);
      expect(fill).toBe(
        scheme === "dark" ? "rgb(24, 27, 32)" : "rgb(255, 255, 255)",
      );
      expect(ground).toBe(
        scheme === "dark" ? "rgb(13, 15, 18)" : "rgb(238, 240, 243)",
      );
      const shadow = await page
        .locator(panel)
        .first()
        .evaluate((el) => getComputedStyle(el).boxShadow);
      // Two visible layers; the transparent ring layers do not count.
      expect((shadow.match(/rgba?\((?!0, 0, 0, 0\))/g) ?? []).length).toBe(2);
    });
  }

  test("edit mode: a dashed edge, no shadow, the handle and actions in view", async ({
    page,
  }) => {
    await page.goto(`/${dashboardId}/edit`);
    await expect(
      page.getByRole("button", { name: "Drag to reorder" }).first(),
    ).toBeVisible({ timeout: 15_000 });
    const card = page.locator("[data-widget-id='k1']");
    const panel = card.locator("> div").first();
    await expect(panel).toHaveCSS("border-top-style", "dashed");
    // Tailwind's ring layers stay in the list, fully transparent.
    const shadow = await panel.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow.replaceAll("rgba(0, 0, 0, 0) 0px 0px 0px 0px", "")).toMatch(
      /^[\s,]*$|^none$/,
    );
    await page.mouse.move(0, 0);
    await expect(
      card.getByRole("button", { name: "Fullscreen" }).locator(".."),
    ).toHaveCSS("opacity", "1");
  });
});
