import { test, expect, ALICE } from "./fixtures";
import { AuthPage } from "./pages/auth";
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
            {
              // Consumes the shared parameter. Neo4j binds `$param_` natively,
              // so whatever the widget renders is what the query received.
              id: "w-echo",
              chartType: "table",
              connectionId: "conn-neo4j-001",
              query: "RETURN $param_shared AS value",
              settings: { title: "Echo" },
            },
          ],
          gridLayout: [
            { i: "w-shared", x: 0, y: 0, w: 4, h: 3 },
            { i: "w-secret", x: 4, y: 0, w: 4, h: 3 },
            { i: "w-untoggled", x: 8, y: 0, w: 4, h: 3 },
            { i: "w-echo", x: 0, y: 3, w: 12, h: 4 },
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

  /**
   * #1691 — "Copy link with current filters". The link must carry exactly
   * what the address bar does (opted-in parameters only), name what it left
   * out, and actually work for someone who has never seen the dashboard.
   */
  test("the copied link carries the opted-in filter into a fresh browser", async ({
    authPage,
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createDashboard(page.request);

    // Capture what the button hands to the clipboard. A stub rather than the
    // real clipboard: reading it back needs a permission grant plus document
    // focus, which is a flake vector, and the button's only job is the string.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: (text: string) => {
            (window as unknown as { __copied?: string }).__copied = text;
            return Promise.resolve();
          },
        },
        configurable: true,
      });
    });

    const fresh = await browser.newContext();
    try {
      await page.goto(`/${id}`);
      await page.locator("#param-text-shared").fill("public-value");
      await page.locator("#param-text-secret").fill("hunter2");
      await expect(page).toHaveURL(/param_shared=public-value/, {
        timeout: 10_000,
      });

      await page
        .getByRole("button", { name: "Copy link with current filters" })
        .click();
      await expect(page.getByText("Link copied", { exact: true })).toBeVisible({
        timeout: 10_000,
      });
      // The toast names what the recipient will not get — and only that.
      // Exact match to avoid the aria-live "Notification …" status span.
      await expect(
        page.getByText(
          'Not included: secret. Turn on "Sync to URL" in each widget\'s editor to share them.',
          { exact: true },
        ),
      ).toBeVisible();

      const copied = await page.evaluate(
        () => (window as unknown as { __copied?: string }).__copied,
      );
      expect(copied).toBeDefined();
      expect(copied).toContain(`/${id}?param_shared=public-value`);
      expect(copied).not.toContain("secret");
      expect(copied).not.toContain("hunter2");

      // A fresh context has no session and no persisted parameters — the URL
      // is the only thing carrying the filter.
      const other = await fresh.newPage();
      await new AuthPage(other).login(ALICE.email, ALICE.password);
      await other.goto(copied as string);

      await expect(other.locator("#param-text-shared")).toHaveValue(
        "public-value",
        { timeout: 15_000 },
      );
      await expect(other.locator("#param-text-secret")).toHaveValue("");
      // …and the consuming widget ran with it.
      await expect(
        other.getByRole("cell", { name: "public-value", exact: true }),
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      await fresh.close();
      await cleanup();
    }
  });
});
