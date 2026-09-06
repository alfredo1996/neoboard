import { test, expect, ALICE } from "./fixtures";
import type { Page, APIRequestContext } from "@playwright/test";

/**
 * A single continuous walkthrough of the chart fixes, recorded to video.
 *
 * Run with: npx playwright test --config playwright.showcase.config.ts
 *
 * Every widget below is seeded through the real API against the real seeded
 * Neo4j movies dataset, so what the video shows is the product, not a mock.
 */

const NEO4J = "conn-neo4j-001";

/** Long enough for a viewer to read the caption and see the chart settle. */
const BEAT = 2600;
const SHORT = 1200;

type Widget = {
  id: string;
  chartType: string;
  query: string;
  title: string;
  options?: Record<string, unknown>;
  w?: number;
  h?: number;
  x?: number;
  y?: number;
};

async function createDashboard(
  request: APIRequestContext,
  name: string,
  widgets: Widget[],
) {
  const res = await request.post("/api/dashboards", { data: { name } });
  const { id } = (await res.json()).data;
  await request.put(`/api/dashboards/${id}`, {
    data: {
      layoutJson: {
        version: 2,
        pages: [
          {
            id: "p1",
            title: "Page 1",
            widgets: widgets.map((w) => ({
              id: w.id,
              chartType: w.chartType,
              connectionId: NEO4J,
              query: w.query,
              settings: {
                title: w.title,
                ...(w.options ? { chartOptions: w.options } : {}),
              },
            })),
            gridLayout: widgets.map((w, i) => ({
              i: w.id,
              x: w.x ?? (i % 2) * 6,
              y: w.y ?? Math.floor(i / 2) * 8,
              w: w.w ?? 6,
              h: w.h ?? 8,
            })),
          },
        ],
      },
    },
  });
  return id as string;
}

/** Put a readable caption on screen, in the product's own type and colours. */
async function caption(page: Page, title: string, body: string) {
  await page.evaluate(
    ({ title, body }) => {
      document.querySelector("#showcase-caption")?.remove();
      const el = document.createElement("div");
      el.id = "showcase-caption";
      el.innerHTML = `<div style="font-size:22px;font-weight:600;letter-spacing:-0.01em">${title}</div><div style="font-size:15px;opacity:0.75;margin-top:6px;max-width:70ch;line-height:1.5">${body}</div>`;
      el.style.cssText = [
        "position:fixed",
        "left:264px",
        "bottom:24px",
        "z-index:99999",
        "padding:16px 22px",
        "border-radius:12px",
        "background:rgba(17,19,24,0.92)",
        "color:#f5f6f8",
        "box-shadow:0 8px 32px rgba(0,0,0,0.35)",
        "font-family:ui-sans-serif,system-ui,-apple-system,sans-serif",
        "text-align:left",
        "pointer-events:none",
      ].join(";");
      document.body.appendChild(el);
    },
    { title, body },
  );
}

async function clearCaption(page: Page) {
  await page.evaluate(() =>
    document.querySelector("#showcase-caption")?.remove(),
  );
}

test("chart fixes walkthrough", async ({ authPage, page }) => {
  test.slow();
  await authPage.login(ALICE.email, ALICE.password);
  await page.waitForTimeout(SHORT);

  // ── 1. The hierarchy the documented query actually returns (#1601) ───────
  // Leaf rows only — the parent names appear in a column but never as rows of
  // their own. Every parent used to be dropped and the chart drew one flat
  // ring.
  const hierarchyId = await createDashboard(
    page.request,
    `Showcase hierarchy ${Date.now()}`,
    [
      {
        id: "sunburst",
        chartType: "sunburst",
        title: "Relationships by type — sunburst",
        query:
          "MATCH (p:Person)-[r]->(m:Movie) RETURN type(r) AS parent, m.title AS name, 1 AS value LIMIT 24",
        w: 6,
        h: 5,
      },
      {
        id: "treemap",
        chartType: "treemap",
        title: "The same rows as a treemap",
        query:
          "MATCH (p:Person)-[r]->(m:Movie) RETURN type(r) AS parent, m.title AS name, 1 AS value LIMIT 24",
        x: 6,
        w: 6,
        h: 5,
      },
    ],
  );

  await page.goto(`/${hierarchyId}`);
  await expect(page.locator("[data-testid='widget-card']").first()).toBeVisible(
    {
      timeout: 30_000,
    },
  );
  await page.waitForTimeout(BEAT);
  await caption(
    page,
    "A hierarchy from leaf rows alone",
    "This is the query our docs publish: it returns only leaf rows, naming each parent in a column. Those parents are now created for you — until this week they were dropped, and both charts drew a single flat ring.",
  );
  await page.waitForTimeout(BEAT * 2);
  await page.screenshot({ path: "showcase-output/01-hierarchy.png" });
  await clearCaption(page);

  // ── 2. Zero rows say so, instead of inventing a number (#1586) ───────────
  const emptyId = await createDashboard(
    page.request,
    `Showcase empty ${Date.now()}`,
    [
      {
        id: "sv",
        chartType: "single-value",
        title: "Revenue (no rows returned)",
        query: "MATCH (n:NoSuchLabel) RETURN n.amount AS value",
        w: 4,
        h: 5,
      },
      {
        id: "bar",
        chartType: "bar",
        title: "Same empty result, bar chart",
        query: "MATCH (n:NoSuchLabel) RETURN n.name AS label, n.v AS value",
        x: 4,
        w: 4,
        h: 5,
      },
      {
        id: "tbl",
        chartType: "table",
        title: "…and as a table",
        query: "MATCH (n:NoSuchLabel) RETURN n.name AS name",
        x: 8,
        w: 4,
        h: 5,
      },
    ],
  );

  await page.goto(`/${emptyId}`);
  await expect(page.locator("[data-testid='widget-card']").first()).toBeVisible(
    {
      timeout: 30_000,
    },
  );
  await page.waitForTimeout(BEAT);
  await caption(
    page,
    "An empty result is stated, not guessed",
    "A query returning no rows used to reach every chart, and each one improvised: the single-value tile printed 0 — a number that was never in the data. All three now say the same thing, in text a screen reader can read.",
  );
  await page.waitForTimeout(BEAT * 2);
  await page.screenshot({ path: "showcase-output/02-empty.png" });
  await clearCaption(page);

  // ── 3. A legend only when it identifies something (#1593) ────────────────
  const legendId = await createDashboard(
    page.request,
    `Showcase legend ${Date.now()}`,
    [
      {
        id: "one",
        chartType: "bar",
        title: "One series — no legend",
        query:
          "MATCH (m:Movie) RETURN m.title AS label, m.released AS released ORDER BY m.released DESC LIMIT 6",
        w: 6,
        h: 5,
      },
      {
        id: "two",
        chartType: "bar",
        title: "Two series — legend appears",
        query:
          "MATCH (m:Movie)<-[:ACTED_IN]-(p:Person) WITH m, count(p) AS cast RETURN m.title AS label, cast AS actors, m.released - 1990 AS age ORDER BY cast DESC LIMIT 6",
        x: 6,
        w: 6,
        h: 5,
      },
    ],
  );

  await page.goto(`/${legendId}`);
  await expect(page.locator("[data-testid='widget-card']").first()).toBeVisible(
    {
      timeout: 30_000,
    },
  );
  await page.waitForTimeout(BEAT);
  await caption(
    page,
    "A legend only when it identifies something",
    "Every single-series chart used to carry a one-swatch legend that just repeated the axis label. The rule to hide it existed in the code all along — three layers of defaults made it unreachable.",
  );
  await page.waitForTimeout(BEAT * 2);
  await page.screenshot({ path: "showcase-output/03-legend.png" });
  await clearCaption(page);

  // ── 4. Decimal places reach the chart (#1582, #1588) ─────────────────────
  const decimalsId = await createDashboard(
    page.request,
    `Showcase decimals ${Date.now()}`,
    [
      {
        id: "raw",
        chartType: "bar",
        title: "Automatic",
        query:
          "MATCH (m:Movie)<-[:ACTED_IN]-(p:Person) WITH m, count(p) AS c RETURN m.title AS label, toFloat(c) * 1.3456 AS value ORDER BY c DESC LIMIT 5",
        options: { showValues: true, decimalPlaces: -1 },
        w: 6,
        h: 5,
      },
      {
        id: "fixed",
        chartType: "bar",
        title: "Decimal Places = 1",
        query:
          "MATCH (m:Movie)<-[:ACTED_IN]-(p:Person) WITH m, count(p) AS c RETURN m.title AS label, toFloat(c) * 1.3456 AS value ORDER BY c DESC LIMIT 5",
        options: { showValues: true, decimalPlaces: 1 },
        x: 6,
        w: 6,
        h: 5,
      },
    ],
  );

  await page.goto(`/${decimalsId}`);
  await expect(page.locator("[data-testid='widget-card']").first()).toBeVisible(
    {
      timeout: 30_000,
    },
  );
  await page.waitForTimeout(BEAT);
  await caption(
    page,
    "The Decimal Places control now reaches the chart",
    "The editor has offered this setting for months; nothing read it. The same rounding applies to the bar label and the tooltip, so a bar can no longer show one number and say another on hover.",
  );
  await page.waitForTimeout(BEAT * 2);
  await page.screenshot({ path: "showcase-output/04-decimals.png" });
  await clearCaption(page);

  // ── 5. Charts follow the theme (#1585) ───────────────────────────────────
  await caption(
    page,
    "Charts re-theme the moment the theme changes",
    "Watch the axes, gridlines and labels. Charts read the page's dark class as their source of truth but never watched it, so they froze on whatever theme they mounted with.",
  );
  await page.waitForTimeout(BEAT);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(BEAT * 2);
  await page.screenshot({ path: "showcase-output/05-dark.png" });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.waitForTimeout(BEAT);
  await clearCaption(page);
  await page.waitForTimeout(SHORT);
});
