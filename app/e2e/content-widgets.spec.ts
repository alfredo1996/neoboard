import fs from "node:fs";
import path from "node:path";
import {
  test,
  expect,
  ALICE,
  createTestDashboard,
  putPage,
  uid,
  editingCrumb,
} from "./fixtures";

type SeedPage = {
  id: string;
  widgets: {
    id: string;
    chartType: string;
    settings: { title: string; chartOptions: Record<string, string> };
  }[];
  gridLayout: { i: string }[];
};

const HEALTHY_PG = "conn-pg-001";

test.describe("Content-only widgets (Markdown & iFrame)", () => {
  let dashboardCleanup: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Content Widgets ${uid()}`,
    );
    dashboardCleanup = cleanup;
    await page.goto(`/${id}/edit`);
    await expect(editingCrumb(page)).toBeVisible();
  });

  test.afterEach(async () => {
    await dashboardCleanup?.();
  });

  test("should add a Markdown widget without connection or query", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Chart type is the second combobox (first is connection)
    await dialog
      .getByRole("combobox", { name: "Chart Type", exact: true })
      .click();
    await page.getByRole("option", { name: "Markdown" }).click();

    // The Add Widget button should be enabled without a query
    await expect(
      dialog.getByRole("button", { name: "Add Widget" }),
    ).toBeEnabled({ timeout: 5_000 });

    // Add the widget
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("Markdown content textarea preserves newlines and renders structure (#1049)", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog
      .getByRole("combobox", { name: "Chart Type", exact: true })
      .click();
    await page.getByRole("option", { name: "Markdown" }).click();

    // Author multiline markdown in the Content tab.
    await expect(dialog.getByRole("tab", { name: "Content" })).toBeVisible();
    const content = dialog.locator("#content");
    await expect(content).toBeVisible({ timeout: 5_000 });
    // It must be a real textarea (not a single-line input that strips newlines).
    await expect(content).toHaveJSProperty("tagName", "TEXTAREA");
    const md = "# Dogfood Heading\n- item one\n- item two";
    await content.fill(md);
    // The textarea kept the newlines.
    expect(await content.inputValue()).toBe(md);

    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();

    // The rendered widget shows an actual heading + list, not one flat line.
    await expect(
      page.getByRole("heading", { name: "Dogfood Heading" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("item one")).toBeVisible();
    await expect(page.getByText("item two")).toBeVisible();
  });

  test("should add an iFrame widget without connection or query", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    // Chart type is the second combobox (first is connection)
    await dialog
      .getByRole("combobox", { name: "Chart Type", exact: true })
      .click();
    await page.getByRole("option", { name: "iFrame" }).click();

    // The Add Widget button should be enabled without a query
    await expect(
      dialog.getByRole("button", { name: "Add Widget" }),
    ).toBeEnabled({ timeout: 5_000 });

    // Add the widget
    await dialog.getByRole("button", { name: "Add Widget" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("seeded iframe tile renders the sandbox that is applied, not the one configured (#1413)", async ({
    page,
  }) => {
    const reference = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, "../../scripts/demo/chart-reference.json"),
        "utf-8",
      ),
    ) as { layout: { pages: SeedPage[] } };
    const seeded = reference.layout.pages.find((p) => p.id === "page-iframe")!;
    const tile = seeded.widgets.find((w) =>
      w.settings.chartOptions.sandbox?.includes("allow-same-origin"),
    )!;
    expect(tile.settings.title).toMatch(/refused/);

    const dashboardId = new URL(page.url()).pathname.split("/")[1];
    const res = await page.request.put(`/api/dashboards/${dashboardId}`, {
      data: {
        layoutJson: {
          version: 2,
          pages: [
            {
              id: seeded.id,
              title: "iframe",
              widgets: [tile],
              gridLayout: seeded.gridLayout
                .filter((g) => g.i === tile.id)
                .map((g) => ({ ...g, x: 0, y: 0 })),
            },
          ],
        },
      },
    });
    expect(res.ok()).toBe(true);

    await page.goto(`/${dashboardId}`);
    await expect(page.getByText(tile.settings.title)).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.locator(`iframe[title="${tile.settings.chartOptions.iframeTitle}"]`),
    ).toHaveAttribute("sandbox", "allow-scripts");
  });

  test("editor warns when a sandbox token is refused (#1413)", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Add Widget" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add Widget" });

    await dialog
      .getByRole("combobox", { name: "Chart Type", exact: true })
      .click();
    await page.getByRole("option", { name: "iFrame" }).click();

    await dialog.locator("#url").fill("https://example.com");
    await dialog.getByRole("tab", { name: "Behavior" }).click();
    await dialog.locator("#sandbox").fill("allow-scripts allow-same-origin");

    await expect(dialog.locator("#sandbox-help")).toContainText(
      '"allow-same-origin" is refused',
    );
    await expect(dialog.locator("#sandbox-help")).toContainText(
      'Applied: "allow-scripts"',
    );
    await expect(
      dialog.locator('iframe[title="Embedded content"]'),
    ).toHaveAttribute("sandbox", "allow-scripts");
  });
});

test.describe("Markdown bold (#2336)", () => {
  test("DS-9: bold text is weight 600, not the preflight's 700", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Markdown bold ${uid()}`,
    );
    try {
      await putPage(
        page.request,
        id,
        [
          {
            id: "md",
            chartType: "markdown",
            connectionId: HEALTHY_PG,
            query: "",
            settings: {
              title: "Bold",
              chartOptions: { content: "Some **bold words** here" },
            },
          },
        ],
        [{ i: "md", x: 0, y: 0, w: 6, h: 3 }],
      );
      await page.goto(`/${id}`);
      const strong = page
        .getByRole("region", { name: "Markdown content", exact: true })
        .locator("strong");
      await expect(strong).toHaveText("bold words", { timeout: 15_000 });
      expect(
        await strong.evaluate((el) => getComputedStyle(el).fontWeight),
      ).toBe("600");
    } finally {
      await cleanup();
    }
  });
});

test.describe("Markdown overflow (#2335)", () => {
  test("DS-6: a markdown card with more text than room shows a fade until the end", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Markdown fade ${uid()}`,
    );
    try {
      const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}`);
      await putPage(
        page.request,
        id,
        [
          {
            id: "md",
            chartType: "markdown",
            connectionId: HEALTHY_PG,
            query: "",
            settings: {
              title: "Long",
              cardBackground: "citrine",
              chartOptions: { content: lines.join("\n\n") },
            },
          },
        ],
        [{ i: "md", x: 0, y: 0, w: 6, h: 3 }],
      );
      await page.goto(`/${id}`);
      const section = page.getByRole("region", {
        name: "Markdown content",
        exact: true,
      });
      // The fade is a mask on the section itself, readable as computed style.
      const mask = () =>
        section.evaluate((el) => getComputedStyle(el).maskImage);
      await expect(section).toHaveAttribute("data-more-below", "", {
        timeout: 15_000,
      });
      expect(await mask()).toContain("linear-gradient");
      await section.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await expect(section).not.toHaveAttribute("data-more-below");
      expect(await mask()).toBe("none");
    } finally {
      await cleanup();
    }
  });
});
