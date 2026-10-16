import { test, expect, ALICE } from "./fixtures";

// #2219: widgets share one ruled sheet; their actions fade in over the header.
// The seeded "Widget Showcase" is the closest seeded dashboard to the demo's
// Movie Highlights: it has single-value widgets ("Total Movies").
test.describe("Ruled sheet", () => {
  test.use({ viewport: { width: 834, height: 1112 } });

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.getByText("Widget Showcase", { exact: true }).click();
    await page.waitForURL(/\/[\w-]+$/, { timeout: 10_000 });
  });

  test("at 834 px a KPI title shows in full and its actions are out of the way", async ({
    page,
  }) => {
    const card = page.locator("[data-testid='widget-card']").filter({
      has: page.getByRole("heading", { name: "Total Movies", exact: true }),
    });
    const title = card.getByRole("heading", {
      name: "Total Movies",
      exact: true,
    });
    await expect(title).toBeVisible({ timeout: 15_000 });

    const clipped = await title.evaluate(
      (el) => el.scrollWidth > el.clientWidth,
    );
    expect(clipped).toBe(false);

    // At rest the actions are faded out, not removed: still in the tree.
    const fullscreen = card.getByRole("button", { name: "Fullscreen" });
    await expect(fullscreen).toBeAttached();
    const bar = fullscreen.locator("..");
    await expect(bar).toHaveCSS("opacity", "0");
  });

  test("panels sit 1 px apart, each drawing a solid 1 px rule", async ({
    page,
  }) => {
    const cards = page.locator("[data-testid='widget-card']");
    await expect(cards.nth(1)).toBeVisible({ timeout: 15_000 });
    const [a, b] = await cards.evaluateAll((els) =>
      els.slice(0, 2).map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el.firstElementChild as Element);
        return {
          x: r.x,
          right: r.right,
          y: r.y,
          outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
        };
      }),
    );
    expect(a.outline).toBe("solid 1px");
    expect(b.outline).toBe("solid 1px");
    // Side by side on the first row: the gutter is one pixel.
    expect(a.y).toBe(b.y);
    expect(b.x - a.right).toBe(1);
  });

  test("hovering a panel, or focusing inside it, fades its actions in", async ({
    page,
  }) => {
    const card = page.locator("[data-testid='widget-card']").first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    const menu = card.getByRole("button", { name: "Widget actions" });
    const bar = menu.locator("..");
    await expect(bar).toHaveCSS("opacity", "0");

    await card.hover();
    await expect(bar).toHaveCSS("opacity", "1");

    await page.mouse.move(0, 0);
    await expect(bar).toHaveCSS("opacity", "0");

    await menu.focus();
    await expect(bar).toHaveCSS("opacity", "1");
  });
});
