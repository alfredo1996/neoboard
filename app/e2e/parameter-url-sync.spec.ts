import { test, expect, ALICE } from "./fixtures";
import type { APIRequestContext } from "@playwright/test";

/**
 * URL sync is opt-in per widget. Only a parameter whose widget has "Sync to
 * URL" turned on may reach the address bar — not when the user sets it, and
 * not when someone arrives with it already in the query string.
 */
test.describe("Parameter URL sync opt-in", () => {
  /** One widget per state of the toggle: on, off, never touched. */
  function paramWidget(
    id: string,
    parameterName: string,
    syncToUrl?: boolean,
    options: Record<string, unknown> = {},
  ) {
    return {
      id,
      chartType: "parameter-select",
      connectionId: "conn-neo4j-001",
      query: "",
      settings: {
        title: parameterName,
        chartOptions: {
          parameterType: "text",
          parameterName,
          ...(syncToUrl === undefined ? {} : { syncToUrl }),
          ...options,
        },
      },
    };
  }

  async function createDashboard(
    request: APIRequestContext,
    widgets: Array<{ id: string } & Record<string, unknown>> = [
      paramWidget("w-shared", "shared", true),
      paramWidget("w-secret", "secret", false),
      paramWidget("w-untoggled", "untoggled"),
    ],
  ) {
    const res = await request.post("/api/dashboards", {
      data: { name: `URL sync ${Date.now()}` },
    });
    if (!res.ok()) throw new Error(`Create dashboard failed: ${res.status()}`);
    const { id } = (await res.json()).data;

    const layout = {
      version: 2 as const,
      pages: [
        {
          id: "page-url-sync",
          title: "Main",
          widgets,
          gridLayout: widgets.map(({ id: i }, n) => ({
            i,
            x: (n % 3) * 4,
            y: 0,
            w: 4,
            h: 4,
          })),
        },
      ],
    };

    const putRes = await request.put(`/api/dashboards/${id}`, {
      data: { layoutJson: layout },
    });
    if (!putRes.ok())
      throw new Error(`Update dashboard failed: ${putRes.status()}`);

    return { id, cleanup: () => request.delete(`/api/dashboards/${id}`) };
  }

  test("only an opted-in parameter reaches the URL", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createDashboard(page.request);

    try {
      await page.goto(`/${id}`);

      const secretInput = page.locator("#param-text-secret");
      await expect(secretInput).toBeVisible({ timeout: 15_000 });
      await secretInput.fill("hunter2");
      // An untouched toggle reads as off in the editor, so it must behave that
      // way here too.
      await page.locator("#param-text-untoggled").fill("also-private");

      // The opted-in param proves the sync effect ran at all.
      await page.locator("#param-text-shared").fill("public-value");
      await expect(page).toHaveURL(/param_shared=public-value/, {
        timeout: 10_000,
      });

      expect(page.url()).not.toContain("param_secret");
      expect(page.url()).not.toContain("hunter2");
      expect(page.url()).not.toContain("param_untoggled");
      expect(page.url()).not.toContain("also-private");
    } finally {
      await cleanup();
    }
  });

  test("a parameter that did not opt in is stripped from an inbound URL", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createDashboard(page.request);

    try {
      await page.goto(
        `/${id}?param_shared=public-value&param_secret=hunter2&param_untoggled=also-private`,
      );

      // The values still apply to the widgets — they just stop being shareable.
      await expect(page.locator("#param-text-secret")).toHaveValue("hunter2", {
        timeout: 15_000,
      });
      await expect(page.locator("#param-text-untoggled")).toHaveValue(
        "also-private",
      );

      await expect(page).toHaveURL(/param_shared=public-value/, {
        timeout: 10_000,
      });
      await expect(page).not.toHaveURL(/param_secret/, { timeout: 10_000 });
      await expect(page).not.toHaveURL(/param_untoggled/);
    } finally {
      await cleanup();
    }
  });

  // #2097: a list and a range come back from the link under their own type.
  test("a multi-select and a date range survive a reload", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createDashboard(page.request, [
      paramWidget("w-actors", "actors", true, {
        parameterType: "multi-select",
        seedQuery: 'UNWIND ["Hugo, Jr.", "Keanu"] AS value RETURN value',
      }),
      paramWidget("w-period", "period", true, { parameterType: "date-range" }),
      {
        id: "w-result",
        chartType: "table",
        connectionId: "conn-neo4j-001",
        query:
          "UNWIND $param_actors AS actor RETURN actor, $param_period_from AS since",
        settings: { title: "Result" },
      },
    ]);

    try {
      await page.goto(`/${id}`);
      const actors = page.getByRole("combobox", { name: "actors" });
      await actors.click({ timeout: 15_000 });
      await page.getByRole("option", { name: "Hugo, Jr." }).click();
      await page.getByRole("option", { name: "Keanu" }).click();
      await page.keyboard.press("Escape");
      const period = page.getByRole("button", { name: "period", exact: true });
      await period.click();
      await page.getByRole("button", { name: /last 7 days/i }).click();

      await expect(page).toHaveURL(/param_period_to=/, { timeout: 10_000 });
      // One row per actor: the query got a list, not one "a,b" string.
      await expect(page.getByRole("row")).toHaveCount(3, { timeout: 15_000 });
      const url = new URL(page.url());
      expect(url.search).not.toContain("object");
      expect(url.searchParams.getAll("param_actors").sort()).toEqual([
        "Hugo, Jr.",
        "Keanu",
      ]);
      const since = url.searchParams.get("param_period_from") ?? "";
      const chips = await page.locator('[title^="Set by"]').allTextContents();
      const actorsText = (await actors.textContent()) ?? "";
      const periodText = (await period.textContent()) ?? "";

      await page.reload();

      // "Set by URL": the link restored these, not the saved session.
      await expect(page.locator('[title="Set by URL"]')).toHaveText(chips, {
        timeout: 15_000,
      });
      await expect(actors).toHaveText(actorsText);
      await expect(period).toHaveText(periodText);
      await expect(page.getByRole("row")).toHaveCount(3, { timeout: 15_000 });
      await expect(
        page.getByRole("cell", { name: since }).first(),
      ).toBeVisible();
      expect(page.url()).not.toContain("object");
    } finally {
      await cleanup();
    }
  });
});
