import fs from "node:fs";
import path from "node:path";
import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";
import type { APIRequestContext } from "@playwright/test";

/**
 * #2335 — four ways a widget says "nothing here" or "can't draw this" that
 * disagreed with the card next to them: the table's Empty Message, a form
 * field labelled optional that the server requires, the selector's error state
 * aligned unlike the cards', and markdown cut off without a cue.
 */

const HEALTHY_PG = "conn-pg-001";

function readSeed(file: string) {
  return JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../scripts/demo", file),
      "utf-8",
    ),
  );
}

async function putPage(
  request: APIRequestContext,
  id: string,
  widgets: unknown[],
  gridLayout: unknown[],
) {
  const put = await request.put(`/api/dashboards/${id}`, {
    data: {
      layoutJson: {
        version: 2,
        pages: [{ id: "p1", title: "Main", widgets, gridLayout }],
      },
    },
  });
  expect(put.ok(), await put.text()).toBe(true);
}

test.describe("Widget states (#2335)", () => {
  test("UX-6: a table with no rows shows the Empty Message it was configured with", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    // The seeded Chart Reference widget, moved onto the test database.
    const reference = readSeed("chart-reference.json");
    const seeded = reference.layout.pages
      .flatMap((p: { widgets: { id: string }[] }) => p.widgets)
      .find((w: { id: string }) => w.id === "page-table-v-67");
    expect(seeded.settings.chartOptions.emptyMessage).toBe(
      "Nothing to show here yet.",
    );
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Empty message ${uid()}`,
    );
    try {
      await putPage(
        page.request,
        id,
        [{ ...seeded, connectionId: HEALTHY_PG }],
        [{ i: seeded.id, x: 0, y: 0, w: 6, h: 4 }],
      );
      await page.goto(`/${id}`);
      await expect(
        page.getByText("Nothing to show here yet.", { exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByText("No data returned from the query.", { exact: true }),
      ).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  test("UX-11: the Category field of the gallery form is required, and empty submit says so on it", async ({
    authPage,
    page,
  }) => {
    test.setTimeout(120_000);
    await authPage.login(ALICE.email, ALICE.password);
    const payload = readSeed("chart-gallery.json");
    const res = await page.request.post("/api/dashboards/import", {
      data: { payload, skippedConnections: Object.keys(payload.connections) },
    });
    expect(res.status()).toBe(201);
    const id = (await res.json()).data.id as string;
    try {
      await page.goto(`/${id}`);
      await page
        .getByRole("tab", { name: "11. Form (write)", exact: true })
        .click();
      const category = page.getByLabel("Category", { exact: true });
      await expect(category).toBeVisible({ timeout: 15_000 });
      // The label is the field's name alone: the server rejects it empty.
      await expect(
        page.getByText("Category (optional)", { exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Submit feedback", exact: true })
        .click();
      await expect(category).toHaveAttribute("aria-invalid", "true");
    } finally {
      await page.request.delete(`/api/dashboards/${id}`);
    }
  });

  test("DS-5: the selector's error and a chart's error centre their title alike", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Error alignment ${uid()}`,
    );
    try {
      await putPage(
        page.request,
        id,
        [
          {
            id: "sel",
            chartType: "parameter-select",
            connectionId: HEALTHY_PG,
            query: "",
            settings: {
              title: "Choice",
              chartOptions: {
                parameterType: "select",
                parameterName: "pick",
                seedQuery: "SELECT 'a' AS value, 'A' AS label",
              },
            },
          },
          {
            id: "tbl",
            chartType: "table",
            connectionId: HEALTHY_PG,
            query: "SELECT 1 AS n",
            settings: { title: "Plain" },
          },
        ],
        [
          { i: "sel", x: 0, y: 0, w: 6, h: 4 },
          { i: "tbl", x: 0, y: 4, w: 6, h: 4 },
        ],
      );
      await page.route("**/api/query", (route) =>
        route.fulfill({
          status: 502,
          json: {
            data: null,
            error: {
              code: "CONNECTOR_UNAVAILABLE",
              message: "connect ECONNREFUSED",
              details: { reason: "network" },
            },
            meta: null,
          },
        }),
      );
      await page.goto(`/${id}`);
      const titles = page.getByText("Connector unavailable", { exact: true });
      await expect(titles).toHaveCount(2, { timeout: 15_000 });

      const centre = async (i: number) => {
        const box = (await titles.nth(i).boundingBox())!;
        return box.x + box.width / 2;
      };
      const [a, b] = [await centre(0), await centre(1)];
      expect(Math.abs(a - b)).toBeLessThanOrEqual(2);
      // Both sit in the middle of a 6-column card, not at its left edge.
      const alert = (await page.getByRole("alert").first().boundingBox())!;
      expect(Math.abs(a - (alert.x + alert.width / 2))).toBeLessThanOrEqual(2);
    } finally {
      await cleanup();
    }
  });

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
      const fade = page.getByTestId("markdown-fade");
      await expect(fade).toBeVisible({ timeout: 15_000 });
      await section.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await expect(fade).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });
});
