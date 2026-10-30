import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * #2369 — a filter shows which cards it drives, and a card refetching keeps
 * its result under a thin line. Movie Highlights' shape: an Actor filter, two
 * cards that use it, one that does not.
 */
test.describe("A filter shows what it drives (#2369)", () => {
  test.describe.configure({ timeout: 90_000 });

  const FILMS_QUERY =
    "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WHERE elementId(p) = $param_actor RETURN m.title AS title ORDER BY title";

  async function setup(
    page: Page,
    name: string,
    filterOptions: Record<string, unknown> = {},
  ) {
    const { id, cleanup } = await createTestDashboard(page.request, name);
    const res = await page.request.put(`/api/dashboards/${id}`, {
      data: {
        layoutJson: {
          version: 2 as const,
          pages: [
            {
              id: "page-1",
              title: "Main",
              widgets: [
                {
                  id: "f-actor",
                  chartType: "parameter-select",
                  connectionId: "conn-neo4j-001",
                  query: "",
                  settings: {
                    title: "Actor",
                    chartOptions: {
                      parameterType: "select",
                      parameterName: "actor",
                      seedQuery:
                        "MATCH (p:Person)-[:ACTED_IN]->(:Movie {title: 'The Matrix'}) RETURN elementId(p) AS value, p.name AS label ORDER BY label",
                      ...filterOptions,
                    },
                  },
                },
                {
                  id: "t-films",
                  chartType: "table",
                  connectionId: "conn-neo4j-001",
                  query: FILMS_QUERY,
                  settings: { title: "Films with $param_actor" },
                },
                {
                  id: "t-stars",
                  chartType: "table",
                  connectionId: "conn-neo4j-001",
                  query:
                    "MATCH (p:Person)-[:ACTED_IN]->(:Movie)<-[:ACTED_IN]-(co:Person) WHERE elementId(p) = $param_actor RETURN DISTINCT co.name AS costar ORDER BY costar",
                  settings: { title: "Co-stars" },
                },
                {
                  id: "m-notes",
                  chartType: "markdown",
                  connectionId: "conn-neo4j-001",
                  query: "",
                  settings: {
                    title: "Notes",
                    chartOptions: { content: "Nothing here uses a filter." },
                  },
                },
              ],
              gridLayout: [
                { i: "f-actor", x: 0, y: 0, w: 4, h: 3 },
                { i: "t-films", x: 4, y: 0, w: 4, h: 6 },
                { i: "t-stars", x: 8, y: 0, w: 4, h: 6 },
                { i: "m-notes", x: 0, y: 3, w: 4, h: 3 },
              ],
            },
          ],
        },
      },
    });
    if (!res.ok()) {
      await cleanup(); // by id, so a failed PUT leaves no dashboard behind
      throw new Error(`PUT dashboard failed: ${res.status()}`);
    }
    return { id, cleanup };
  }

  const card = (page: Page, id: string) =>
    page.locator(`[data-widget-id="${id}"]`);
  const tag = (page: Page) => page.getByText("Uses Actor", { exact: true });
  const trigger = (page: Page) =>
    page.getByRole("combobox", { name: "Actor", exact: true });

  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("hovering the filter marks the two cards that use it, and not the others", async ({
    page,
  }) => {
    const { id, cleanup } = await setup(page, `drives-hover ${uid()}`);
    try {
      await page.goto(`/${id}`);
      await expect(trigger(page)).toBeVisible({ timeout: 15_000 });
      await card(page, "f-actor").hover();
      await expect(tag(page)).toHaveCount(2);
      await expect(
        card(page, "t-films").getByText("Uses Actor", { exact: true }),
      ).toBeVisible();
      await expect(
        card(page, "t-stars").getByText("Uses Actor", { exact: true }),
      ).toBeVisible();
      await expect(
        card(page, "m-notes").getByText("Uses Actor", { exact: true }),
      ).toHaveCount(0);
      await expect(card(page, "t-films").locator("> div")).toHaveAttribute(
        "data-driven",
        "true",
      );
      await card(page, "m-notes").hover();
      await expect(tag(page)).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  test("tabbing into the filter does the same, and tabbing out clears it", async ({
    page,
  }) => {
    const { id, cleanup } = await setup(page, `drives-tab ${uid()}`);
    try {
      await page.goto(`/${id}`);
      await expect(trigger(page)).toBeVisible({ timeout: 15_000 });
      await expect(trigger(page)).toBeEnabled({ timeout: 15_000 });
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press("Tab");
        if (await trigger(page).evaluate((el) => el === document.activeElement))
          break;
      }
      await expect(trigger(page)).toBeFocused();
      await expect(tag(page)).toHaveCount(2);
      await page.keyboard.press("Tab");
      await expect(trigger(page)).not.toBeFocused();
      await expect(tag(page)).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  test("choosing a value with the mouse and moving away leaves no card lit", async ({
    page,
  }) => {
    const { id, cleanup } = await setup(page, `drives-mouse ${uid()}`);
    try {
      await page.goto(`/${id}`);
      await expect(trigger(page)).toBeEnabled({ timeout: 15_000 });
      await trigger(page).click();
      // The list is open: the cards stay lit though the pointer is on it.
      await expect(tag(page)).toHaveCount(2);
      await page
        .getByRole("option", { name: "Keanu Reeves", exact: true })
        .click();
      await expect(trigger(page)).toHaveText(/Keanu Reeves/);
      await card(page, "m-notes").hover();
      await expect(tag(page)).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  test("a mouse choice on a list without search does not leave the filter lit", async ({
    page,
  }) => {
    const { id, cleanup } = await setup(page, `drives-nosearch ${uid()}`, {
      searchable: false,
    });
    try {
      await page.goto(`/${id}`);
      await expect(trigger(page)).toBeEnabled({ timeout: 15_000 });
      await trigger(page).click();
      await page
        .getByRole("option", { name: "Keanu Reeves", exact: true })
        .click();
      await expect(trigger(page)).toHaveText(/Keanu Reeves/);
      // Focus went back to the trigger, which matches :focus-visible.
      await expect(trigger(page)).toBeFocused();
      await card(page, "m-notes").hover();
      await expect(tag(page)).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  test("a mouse click into a text filter does not leave it lit once the pointer moves away", async ({
    page,
  }) => {
    const { id, cleanup } = await setup(page, `drives-text ${uid()}`, {
      parameterType: "text",
      seedQuery: undefined,
    });
    try {
      await page.goto(`/${id}`);
      const input = page.getByLabel("Actor", { exact: true });
      await expect(input).toBeVisible({ timeout: 15_000 });
      await input.click();
      await expect(input).toBeFocused();
      await card(page, "m-notes").hover();
      await expect(tag(page)).toHaveCount(0);
      // The keyboard still lights it: Tab out and back in.
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(input).toBeFocused();
      await expect(tag(page)).toHaveCount(2);
    } finally {
      await cleanup();
    }
  });

  test("changing the filter keeps the rows under a line, never the loading skeleton", async ({
    page,
  }) => {
    const { id, cleanup } = await setup(page, `drives-line ${uid()}`);
    let release!: () => void;
    let held = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/query", async (route) => {
      if (held && (route.request().postData() ?? "").includes("AS title")) {
        await gate;
      }
      await route.continue();
    });
    try {
      await page.goto(`/${id}`);
      await expect(trigger(page)).toBeEnabled({ timeout: 15_000 });
      await trigger(page).click();
      await page
        .getByRole("option", { name: "Keanu Reeves", exact: true })
        .click();
      const films = card(page, "t-films");
      const firstRow = films.getByRole("row").nth(1);
      await expect(firstRow).toBeVisible({ timeout: 15_000 });
      const before = await firstRow.innerText();
      const header = films.locator("[data-widget-header]");
      // The title interpolates the filter's value: it names the rows shown.
      const titleBefore = (await header.innerText()).split("\n")[0];
      expect(titleBefore).toMatch(/^Films with ./);
      const sourceLine = header.locator("[title*='rows']");
      const sourceBefore = (await sourceLine.getAttribute("title")) ?? "";
      expect(sourceBefore).toContain("rows");

      held = true;
      await trigger(page).click();
      await page
        .getByRole("option", { name: "Laurence Fishburne", exact: true })
        .click();

      const line = films.locator("[data-refresh-line]");
      await expect(line).toBeVisible();
      // Old rows stay, nothing blanks.
      await expect(page.locator("[data-loading='true']")).toHaveCount(0);
      await expect(firstRow).toHaveText(before);
      // The title and the source line wait with the rows.
      await expect(header).toContainText(titleBefore);
      await expect(sourceLine).toHaveAttribute("title", sourceBefore);

      // Reduced motion (the suite's default): no animation, the full line.
      const animation = () =>
        line.evaluate((el) => getComputedStyle(el).animationName);
      await expect.poll(animation).toBe("none");
      const [lineBox, panelBox] = await Promise.all([
        line.boundingBox(),
        films.locator("> div").boundingBox(),
      ]);
      expect(lineBox!.width).toBe(panelBox!.width - 2);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect.poll(animation).toBe("refresh-line-sweep");

      held = false;
      release();
      await expect(firstRow).not.toHaveText(before, { timeout: 15_000 });
      await expect(line).toHaveCount(0);
      await expect(header).not.toContainText(titleBefore);
      await expect(header).toContainText("Films with ");
    } finally {
      release();
      await cleanup();
    }
  });
});
