import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";
import type { APIRequestContext } from "@playwright/test";

// Dashboard page polish (#2334): a missing dashboard shows at once, the filter
// chip shows the label, content lines up with the header, the share email fits.

async function putLayout(
  request: APIRequestContext,
  id: string,
  widgets: object[],
  gridLayout: object[],
) {
  const res = await request.put(`/api/dashboards/${id}`, {
    data: {
      layoutJson: {
        version: 2,
        pages: [{ id: "p0", title: "Page 1", widgets, gridLayout }],
      },
    },
  });
  expect(res.ok()).toBe(true);
}

test.describe("Dashboard page polish (#2334)", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("UX-7: an unknown dashboard says so within 2 s, after one request", async ({
    page,
  }) => {
    const ghost = "00000000-0000-0000-0000-000000000000";
    const calls: string[] = [];
    page.on("request", (req) => {
      if (new URL(req.url()).pathname === `/api/dashboards/${ghost}`)
        calls.push(req.method());
    });
    await page.goto(`/${ghost}`);
    await expect(
      page.getByText("Dashboard not found", { exact: true }),
    ).toBeVisible({
      timeout: 2_000,
    });
    // Past the first back-off (1 s) a retry would have shown by now.
    await page.waitForTimeout(1_500);
    expect(calls).toEqual(["GET"]);
  });

  test("UX-9: the strip chip shows the option label, not the raw value", async ({
    page,
  }) => {
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Chip label ${uid()}`,
    );
    try {
      await putLayout(
        page.request,
        id,
        [
          {
            id: "sel",
            chartType: "parameter-select",
            connectionId: "conn-neo4j-001",
            query: "",
            settings: {
              title: "Continent",
              chartOptions: {
                parameterType: "select",
                parameterName: "continent",
                seedQuery:
                  "RETURN '%' AS value, 'All continents' AS label UNION RETURN 'EU' AS value, 'Europe' AS label",
              },
            },
          },
        ],
        [{ i: "sel", x: 0, y: 0, w: 4, h: 3 }],
      );
      await page.goto(`/${id}`);
      await page.getByRole("combobox").first().click();
      await page
        .getByRole("option", { name: "All continents", exact: true })
        .click();
      const strip = page.getByRole("region", {
        name: "Active filters",
        exact: true,
      });
      await expect(strip).toContainText("Continent: All continents", {
        timeout: 10_000,
      });
      await expect(strip).not.toContainText("Continent: %");
    } finally {
      await cleanup();
    }
  });

  test("UX-9: a default value shows its label on load, with no click and no extra query", async ({
    page,
  }) => {
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Chip default ${uid()}`,
    );
    try {
      await putLayout(
        page.request,
        id,
        [
          {
            id: "sel",
            chartType: "parameter-select",
            connectionId: "conn-neo4j-001",
            query: "",
            settings: {
              title: "Continent",
              chartOptions: {
                parameterType: "select",
                parameterName: "continent",
                defaultValue: "%",
                seedQuery:
                  "RETURN '%' AS value, 'All continents' AS label UNION RETURN 'EU' AS value, 'Europe' AS label",
              },
            },
          },
        ],
        [{ i: "sel", x: 0, y: 0, w: 4, h: 3 }],
      );
      let queries = 0;
      page.on("request", (req) => {
        if (new URL(req.url()).pathname === "/api/query") queries++;
      });
      await page.goto(`/${id}`);
      const strip = page.getByRole("region", {
        name: "Active filters",
        exact: true,
      });
      await expect(strip).toContainText("Continent: All continents", {
        timeout: 10_000,
      });
      // Writing the label is display only: it must not refetch anything.
      const settled = queries;
      await page.waitForTimeout(1_500);
      expect(queries).toBe(settled);
    } finally {
      await cleanup();
    }
  });

  test("DS-4: header, title and cards share one left and right edge, at 1440 and 1800", async ({
    page,
  }) => {
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Edges ${uid()}`,
    );
    try {
      await putLayout(
        page.request,
        id,
        [
          {
            id: "md",
            chartType: "markdown",
            connectionId: "",
            query: "",
            settings: { title: "Note", chartOptions: { content: "hello" } },
          },
        ],
        [{ i: "md", x: 0, y: 0, w: 12, h: 3 }],
      );
      for (const width of [1440, 1800]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/${id}`);
        await expect(page.getByTestId("widget-card").first()).toBeVisible({
          timeout: 15_000,
        });
        const edges = await page.evaluate(() => {
          const rect = (sel: string) =>
            document.querySelector(sel)!.getBoundingClientRect();
          const header = rect("main header");
          const card = rect('[data-testid="widget-card"]');
          const title = rect("main header h1");
          // md:px-7 is 28 px of the header's own padding.
          return {
            titleLeft: title.left,
            cardLeft: card.left,
            headerRight: header.right - 28,
            cardRight: card.right,
          };
        });
        expect(
          Math.abs(edges.cardLeft - edges.titleLeft),
          `left at ${width}`,
        ).toBeLessThanOrEqual(0.5);
        expect(
          Math.abs(edges.cardRight - edges.headerRight),
          `right at ${width}`,
        ).toBeLessThanOrEqual(0.5);
      }
    } finally {
      await cleanup();
    }
  });

  test("DS-12: the share sheet's email field has room for its placeholder", async ({
    page,
  }) => {
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Share room ${uid()}`,
    );
    try {
      await page.goto(`/${id}`);
      await page.getByRole("button", { name: "Share", exact: true }).click();
      const email = page.locator("#assign-email");
      await expect(email).toBeVisible({ timeout: 10_000 });
      // Chromium leaves placeholder overflow out of scrollWidth, so measure the
      // placeholder's own text against the room the field has.
      const { textWidth, room } = await email.evaluate(
        (el: HTMLInputElement) => {
          const cs = getComputedStyle(el);
          const ctx = document.createElement("canvas").getContext("2d")!;
          ctx.font = cs.font;
          return {
            textWidth: ctx.measureText(el.placeholder).width,
            room:
              el.clientWidth -
              Number.parseFloat(cs.paddingLeft) -
              Number.parseFloat(cs.paddingRight),
          };
        },
      );
      expect(textWidth).toBeGreaterThan(0);
      expect(textWidth).toBeLessThanOrEqual(room);
      // Full row: Assign sits below, not beside, the email.
      const emailBox = (await email.boundingBox())!;
      const assign = (await page
        .getByRole("button", { name: "Assign", exact: true })
        .boundingBox())!;
      expect(assign.y).toBeGreaterThan(emailBox.y + emailBox.height);
    } finally {
      await cleanup();
    }
  });

  test("UX-12: a custom refresh below 5 s says so and keeps the menu open", async ({
    page,
  }) => {
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Refresh min ${uid()}`,
    );
    try {
      await page.goto(`/${id}`);
      await page.getByTestId("auto-refresh-trigger").click();
      await page.getByTestId("custom-interval-input").fill("2");
      await page.getByTestId("custom-interval-apply").click();
      await expect(
        page.getByText("Minimum is 5 seconds", { exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("custom-interval-input")).toBeVisible();
      await expect(page.getByTestId("auto-refresh-trigger")).toHaveText(
        "Auto-refresh",
      );
    } finally {
      await cleanup();
    }
  });
});
