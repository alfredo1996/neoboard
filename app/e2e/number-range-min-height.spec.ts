import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * #2374: a number-range selector needs three rows (inputs + slider ~96px).
 * A saved two-row card renders at three, and a resize cannot go below it.
 */

const SHOTS = process.env.SHOTS_DIR;

function widget(id: string, parameterType: string) {
  return {
    id,
    chartType: "parameter-select",
    connectionId: "",
    query: "",
    settings: {
      title: `Range ${id}`,
      chartOptions: {
        parameterType,
        parameterName: `p_${id}`,
        rangeMin: 0,
        rangeMax: 100,
        rangeStep: 1,
      },
    },
  };
}

const cardH = (page: Page, id: string) =>
  page
    .locator(".react-grid-item", { hasText: `Range ${id}` })
    .evaluate((el) => Math.round(el.getBoundingClientRect().height));

// Slack between each field's bottom and the card body's bottom padding.
const fieldSlack = (page: Page) =>
  page.evaluate(() => {
    const card = [...document.querySelectorAll(".react-grid-item")].find((e) =>
      e.textContent?.includes("Range two"),
    );
    const bodies = [
      ...(card?.querySelectorAll("[class*=overflow-hidden][class*=pb-4]") ??
        []),
    ];
    return bodies.flatMap((body) => {
      const pad = Number.parseFloat(getComputedStyle(body).paddingBottom);
      const bottom = body.getBoundingClientRect().bottom;
      return [...body.querySelectorAll("input, [role=slider]")].map((f) =>
        Math.round(bottom - f.getBoundingClientRect().bottom - pad),
      );
    });
  });

test.describe("Number-range selector minimum height (#2374)", () => {
  test("a saved two-row card renders at three, resizes no lower, and shows every field", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `range-min-h ${uid()}`,
    );
    try {
      const put = await page.request.put(`/api/dashboards/${id}`, {
        data: {
          layoutJson: {
            version: 2,
            pages: [
              {
                id: "page-1",
                title: "Main",
                widgets: [widget("two", "number-range"), widget("txt", "text")],
                gridLayout: [
                  { i: "two", x: 0, y: 0, w: 6, h: 2 },
                  { i: "txt", x: 6, y: 0, w: 6, h: 2 },
                ],
              },
            ],
          },
        },
      });
      expect(put.ok()).toBe(true);

      await page.goto(`/${id}`);
      await expect(page.getByLabel("P two minimum")).toBeVisible({
        timeout: 15_000,
      });

      // Saved at h:2, rendered at 3 rows: taller than the 2-row text card.
      const two = await cardH(page, "two");
      const txt = await cardH(page, "txt");
      expect(two).toBeGreaterThan(txt);

      const view = await fieldSlack(page);
      expect(view.length).toBeGreaterThanOrEqual(3); // slider + 2 inputs
      for (const slack of view) expect(slack).toBeGreaterThanOrEqual(0);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/view.png` });

      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Save", exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/edit.png` });
      const edit = await fieldSlack(page);
      expect(edit.length).toBeGreaterThanOrEqual(3);
      for (const slack of edit) expect(slack).toBeGreaterThanOrEqual(0);

      // Drag the bottom-right handle up two rows: height must not change.
      const item = page.locator(".react-grid-item", {
        hasText: "Range two",
      });
      const handle = item.locator(".react-resizable-handle");
      const box = (await handle.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y - 150, { steps: 10 });
      await page.mouse.up();
      expect(await cardH(page, "two")).toBe(two);
    } finally {
      await cleanup();
    }
  });
});
