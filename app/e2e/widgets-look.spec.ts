import fs from "node:fs";
import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";

/**
 * The widgets that are not charts, in the new style (#2232): the parameter
 * selector and the widget waiting on it, the form, text (Markdown), JSON and
 * the embedded page.
 *
 * Set SHOTS_2232=<dir> to write a light and a dark screenshot of each widget
 * there (review evidence; unset in CI).
 */

const PG = "conn-pg-001";
const SHOTS = process.env.SHOTS_2232;

const SEED =
  "SELECT 'Western EU' AS value UNION ALL SELECT 'Nordics' UNION ALL SELECT 'Iberia'";
const CITY_SEED =
  "SELECT 'Oslo' AS value WHERE $param_gallery_region = 'Western EU' UNION ALL SELECT 'Lisbon' WHERE $param_gallery_region = 'Western EU'";
const ORDERS =
  "SELECT 578 AS id, 'shipped' AS status, 1672.56 AS total, '2026-03-31 22:52' AS order_date, 'Priya Johnson' AS customer UNION ALL SELECT 516, 'cancelled', 652.88, '2026-03-31 22:24', 'Irene Ito' UNION ALL SELECT 929, 'pending', 1937.52, '2026-03-31 19:59', 'Diego Yamamoto'";

const MARKDOWN = [
  "Static content for annotations, explainers and inline documentation.",
  "",
  "### What it supports",
  "",
  "- **Headings** H1-H6",
  "- Lists, links, and `inline code`",
  "",
  "```sql",
  "-- Even code blocks with syntax highlighting",
  "SELECT COUNT(*) FROM orders WHERE status = 'delivered';",
  "```",
  "",
  "| Feature | Supported |",
  "| --- | --- |",
  "| Tables | Yes |",
  "| HTML | No |",
].join("\n");

function layout(baseURL: string) {
  return {
    version: 2 as const,
    pages: [
      {
        id: "p1",
        title: "Main",
        widgets: [
          {
            id: "w-region",
            chartType: "parameter-select",
            connectionId: PG,
            query: "",
            settings: {
              title: "Region",
              chartOptions: {
                parameterType: "select",
                parameterName: "gallery_region",
                seedQuery: SEED,
              },
            },
          },
          {
            id: "w-city",
            chartType: "parameter-select",
            connectionId: PG,
            query: "",
            settings: {
              title: "City",
              chartOptions: {
                parameterType: "select",
                parameterName: "gallery_city",
                parentParameterName: "gallery_region",
                seedQuery: CITY_SEED,
              },
            },
          },
          {
            id: "w-revenue",
            chartType: "single-value",
            connectionId: PG,
            query:
              "SELECT 330694 AS revenue WHERE $param_gallery_region = 'Western EU'",
            settings: { title: "Revenue in $param_gallery_region" },
          },
          {
            id: "w-form",
            chartType: "form",
            connectionId: PG,
            query: "SELECT 1 WHERE $param_category IS NOT NULL",
            settings: {
              title: "Submit feedback",
              chartOptions: { submitButtonText: "Submit feedback" },
              formFields: [
                {
                  id: "f-rating",
                  label: "Rating (1-5)",
                  parameterName: "rating",
                  parameterType: "number-range",
                  rangeMin: 1,
                  rangeMax: 5,
                  rangeStep: 1,
                },
                {
                  id: "f-category",
                  label: "Category",
                  parameterName: "category",
                  parameterType: "text",
                  placeholder: "e.g. shipping, ui, support",
                },
              ],
            },
          },
          {
            id: "w-md",
            chartType: "markdown",
            connectionId: "",
            query: "",
            settings: {
              title: "Markdown widget",
              chartOptions: { content: MARKDOWN },
            },
          },
          {
            id: "w-md-bare",
            chartType: "markdown",
            connectionId: "",
            query: "",
            settings: { chartOptions: { content: "No title, so no header." } },
          },
          {
            id: "w-json",
            chartType: "json",
            connectionId: PG,
            query: ORDERS,
            settings: { title: "Last orders (raw)" },
          },
          {
            id: "w-iframe",
            chartType: "iframe",
            connectionId: "",
            query: "",
            settings: {
              title: "Embedded page",
              chartOptions: { url: `${baseURL}/login` },
            },
          },
        ],
        gridLayout: [
          { i: "w-region", x: 0, y: 0, w: 6, h: 3 },
          { i: "w-revenue", x: 6, y: 0, w: 6, h: 3 },
          { i: "w-form", x: 0, y: 3, w: 6, h: 8 },
          { i: "w-md", x: 6, y: 3, w: 6, h: 10 },
          { i: "w-md-bare", x: 0, y: 11, w: 6, h: 2 },
          { i: "w-json", x: 0, y: 13, w: 6, h: 7 },
          { i: "w-iframe", x: 6, y: 13, w: 6, h: 7 },
          { i: "w-city", x: 0, y: 20, w: 6, h: 3 },
        ],
      },
    ],
  };
}

test.describe("Widgets that are not charts (#2232)", () => {
  test.describe.configure({ timeout: 90_000 });

  test("selector, form, text, JSON and embedded page", async ({
    authPage,
    page,
    baseURL,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const { id, cleanup } = await createTestDashboard(
      page.request,
      `Widgets look ${uid()}`,
    );
    try {
      const put = await page.request.put(`/api/dashboards/${id}`, {
        data: { layoutJson: layout(baseURL ?? "http://localhost:3800") },
      });
      expect(put.ok()).toBe(true);
      await page.setViewportSize({ width: 1400, height: 1100 });
      await page.goto(`/${id}`);

      const card = (w: string) => page.locator(`[data-widget-id="${w}"]`);
      const shot = async (w: string, name: string, scheme: string) => {
        if (!SHOTS) return;
        fs.mkdirSync(SHOTS, { recursive: true });
        await card(w).screenshot({ path: `${SHOTS}/${name}-${scheme}.png` });
      };
      // The app applies .dark in an effect after the media change, so wait
      // for it: a read straight after emulateMedia races the switch.
      const expectScheme = async (scheme: "light" | "dark") => {
        const html = expect(page.locator("html"));
        await (scheme === "dark"
          ? html.toHaveClass(/\bdark\b/)
          : html.not.toHaveClass(/\bdark\b/));
      };
      const shootAll = async (scheme: "light" | "dark", phase: string) => {
        await page.emulateMedia({ colorScheme: scheme });
        await expectScheme(scheme);
        if (phase === "empty") {
          await shot("w-region", "1-selector-empty", scheme);
          await shot("w-revenue", "2-dependent-waiting", scheme);
        } else if (phase === "filled") {
          await shot("w-region", "3-selector-filled", scheme);
          await shot("w-revenue", "4-dependent-filled", scheme);
        } else {
          await shot("w-form", "5-form", scheme);
          await shot("w-md", "6-markdown", scheme);
          await shot("w-json", "7-json", scheme);
          await shot("w-iframe", "8-embed", scheme);
        }
      };

      // ── Parameter selector: one name, a placeholder, no third label ──
      const select = page.getByRole("combobox", { name: "Region" });
      await expect(select).toHaveText("Pick a region…", { timeout: 15_000 });
      await expect(card("w-region").getByText("Gallery region")).toHaveCount(0);
      await expect(page.getByText("GALLERY_REGION")).toHaveCount(0);
      // ── The widget waiting on it names it, never the raw token ──
      await expect(
        card("w-revenue").getByText("Revenue in [Region]"),
      ).toBeVisible();
      await expect(
        card("w-revenue").getByText("Pick a region above to see this."),
      ).toBeVisible();
      await expect(card("w-revenue").getByText(/\$param_/)).toHaveCount(0);
      await expect(
        card("w-revenue").getByText("Waiting for parameters…"),
      ).toHaveCount(0);
      // ── A cascading child names its parent as the page does ──
      await expect(
        card("w-city").getByRole("combobox", { name: "City" }),
      ).toHaveText("Select Region first…");
      await expect(
        card("w-city").getByText("(depends on Region)"),
      ).toBeVisible();
      await expect(card("w-city").getByText(/Gallery region/)).toHaveCount(0);
      await shootAll("light", "empty");
      await shootAll("dark", "empty");

      await select.click();
      await page.getByRole("option", { name: "Western EU" }).click();
      await expect(
        card("w-revenue").getByText("Revenue in Western EU"),
      ).toBeVisible({ timeout: 15_000 });
      await expect(select).toHaveText("Western EU");
      // ── The filter chip is named by the same title, not the key ──
      const chips = page.getByRole("group", { name: "Active filters" });
      await expect(chips).toHaveText(/Region is Western EU/);
      await expect(chips.getByText(/Gallery region/)).toHaveCount(0);
      if (SHOTS) {
        for (const scheme of ["light", "dark"] as const) {
          await page.emulateMedia({ colorScheme: scheme });
          await expectScheme(scheme);
          await chips.screenshot({
            path: `${SHOTS}/9-filterline-${scheme}.png`,
          });
          await card("w-city").screenshot({
            path: `${SHOTS}/10-cascade-child-${scheme}.png`,
          });
        }
      }
      await shootAll("light", "filled");
      await shootAll("dark", "filled");
      await page.emulateMedia({ colorScheme: "light" });
      await expectScheme("light");

      // ── Form: the button fits its label on one line, the write target beside it ──
      const submit = card("w-form").getByRole("button", {
        name: "Submit feedback",
      });
      await expect(submit).toBeVisible();
      const box = await submit.boundingBox();
      const cardBox = await card("w-form").boundingBox();
      expect(box!.height).toBeLessThan(44);
      expect(box!.width).toBeLessThan(cardBox!.width / 2);
      await expect(card("w-form").getByText(/^Writes to /)).toBeVisible();

      // ── Text: sans headings, Plex Mono code, azure keywords ──
      const md = card("w-md");
      await expect(
        md.getByRole("heading", { name: "What it supports" }),
      ).toBeVisible();
      const fonts = await md.evaluate((el) => {
        const h = el.querySelector("h3")!;
        const code = el.querySelector("pre code")!;
        return {
          heading: getComputedStyle(h).fontFamily,
          code: getComputedStyle(code).fontFamily,
          keyword: getComputedStyle(
            [...el.querySelectorAll("pre span")].find(
              (s) => s.textContent === "SELECT",
            )!,
          ).color,
        };
      });
      expect(fonts.heading).toContain("IBM Plex Sans");
      expect(fonts.code).toContain("IBM Plex Mono");
      expect(fonts.keyword).toBe("rgb(11, 101, 203)");
      // Dark: the keyword and the block's own tint both change with the theme
      await page.emulateMedia({ colorScheme: "dark" });
      await expectScheme("dark");
      const dark = await md.evaluate((el) => ({
        keyword: getComputedStyle(
          [...el.querySelectorAll("pre span")].find(
            (s) => s.textContent === "SELECT",
          )!,
        ).color,
        block: getComputedStyle(el.querySelector("pre")!).backgroundColor,
      }));
      expect(dark.keyword).toBe("rgb(105, 167, 242)");
      // --code-bg in dark: lighter than the card it sits on, not the card itself
      expect(dark.block).toBe("rgb(31, 35, 41)");
      await page.emulateMedia({ colorScheme: "light" });
      await expectScheme("light");
      // An untitled text widget has no header band: nothing above the text
      const bare = card("w-md-bare");
      // (the header is there: a missing one would read as height 0 too)
      await expect(bare.locator("[data-widget-header]")).toHaveCount(1);
      const header = await bare.locator("[data-widget-header]").boundingBox();
      expect(header).not.toBeNull();
      expect(header!.height).toBeLessThanOrEqual(1);

      // ── JSON: rows folded to one line; a click opens one ──
      const json = card("w-json");
      const row = json
        .getByTestId("json-viewer")
        .getByRole("button", { expanded: false })
        .first();
      await expect(row).toHaveText(
        '{id: 578, status: "shipped", total: 1672.56, … },',
        { timeout: 15_000 },
      );
      await expect(json.getByText(/^customer:/)).toHaveCount(0);
      await row.click();
      await expect(json.getByText(/^customer:/)).toBeVisible();

      // ── Embedded page: the domain, linked to open in a new tab ──
      const link = card("w-iframe")
        .locator("[data-widget-header]")
        .getByRole("link", { name: /localhost/ });
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      await expect(link).toHaveText(
        `${new URL(page.url()).host} ↗ (opens in a new tab)`,
      );
      await expect(card("w-iframe").locator("iframe").first()).toHaveAttribute(
        "sandbox",
        /.+/,
      );

      await shootAll("light", "rest");
      await shootAll("dark", "rest");
    } finally {
      await cleanup();
    }
  });
});
