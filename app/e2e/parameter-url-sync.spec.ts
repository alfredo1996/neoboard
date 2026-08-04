import { test, expect, ALICE } from "./fixtures";
import type { APIRequestContext } from "@playwright/test";

/**
 * URL sync is opt-in per widget. Only a parameter whose widget has "Sync to
 * URL" turned on may reach the address bar — not when the user sets it, and
 * not when someone arrives with it already in the query string.
 */
test.describe("Parameter URL sync opt-in", () => {
  /** One widget per state of the toggle: on, off, never touched. */
  function paramWidget(id: string, parameterName: string, syncToUrl?: boolean) {
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
        },
      },
    };
  }

  async function createDashboard(request: APIRequestContext) {
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
          widgets: [
            paramWidget("w-shared", "shared", true),
            paramWidget("w-secret", "secret", false),
            paramWidget("w-untoggled", "untoggled"),
          ],
          gridLayout: [
            { i: "w-shared", x: 0, y: 0, w: 4, h: 3 },
            { i: "w-secret", x: 4, y: 0, w: 4, h: 3 },
            { i: "w-untoggled", x: 8, y: 0, w: 4, h: 3 },
          ],
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
});
