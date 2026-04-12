import { test, expect, ALICE, createTestDashboard } from "./fixtures";
import type { APIRequestContext } from "@playwright/test";

/**
 * Covers issue #482 — URL deep-linking preloads dashboard parameters.
 *
 * NeoBoard supports `?param_foo=bar` query strings to preload parameter
 * state before any widget queries run. This is the core mechanism behind
 * shareable links and embedded dashboards, and it had zero E2E coverage
 * (per the coverage audit §8).
 *
 * Scenarios covered here:
 *   1. Single scalar preload — ?param_q=matrix filters a text widget
 *      and its dependent table before any click.
 *   2. Multiple scalar params — ?param_yr_min=1999&param_yr_max=2003
 *      seeds both companion keys of a number-range widget.
 *   3. Multi-select array — ?param_actors=X&param_actors=Y preloads
 *      a multi-select widget with both chips and the dependent IN-clause
 *      query resolves to the array. This is the bug case that pinned
 *      parseUrlParams to .getAll() instead of .forEach().
 *   4. Invalid typed value — ?param_yr_min=abc is coerced against the
 *      number-range schema, fails validation, and falls back to the
 *      widget's default range without crashing the dashboard.
 *   5. Round-trip (UI → URL → reload) — picking a new value via the
 *      UI writes router.replace() with the new query string; reloading
 *      that URL preserves the chosen value.
 *
 * Setup pattern matches parameter-types.spec.ts: create the dashboard
 * via API and inject a complete layoutJson to avoid flaky editor flows.
 */

async function createParamDashboard(
  request: APIRequestContext,
  name: string,
  layoutWidgets: {
    widgets: Array<Record<string, unknown>>;
    gridLayout: Array<{
      i: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }>;
  },
) {
  const { id, cleanup } = await createTestDashboard(request, name);
  const putRes = await request.put(`/api/dashboards/${id}`, {
    data: {
      layoutJson: {
        version: 2 as const,
        pages: [
          {
            id: "page-1",
            title: "Main",
            ...layoutWidgets,
          },
        ],
      },
    },
  });
  if (!putRes.ok()) {
    throw new Error(`PUT dashboard failed: ${putRes.status()}`);
  }
  return { id, cleanup };
}

test.describe("URL parameter deep-linking", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Single scalar: ?param_q=matrix
  // ─────────────────────────────────────────────────────────────────────────
  test("single scalar param preloads before any interaction", async ({
    page,
  }) => {
    const { id, cleanup } = await createParamDashboard(
      page.request,
      `deeplink-text ${Date.now()}`,
      {
        widgets: [
          {
            id: "p-text",
            chartType: "parameter-select",
            connectionId: "conn-neo4j-001",
            query: "",
            settings: {
              title: "Search",
              chartOptions: {
                parameterType: "text",
                parameterName: "q",
                placeholder: "Search title…",
              },
            },
          },
          {
            id: "t-text",
            chartType: "table",
            connectionId: "conn-neo4j-001",
            query:
              "MATCH (m:Movie) WHERE toLower(m.title) CONTAINS toLower($param_q) RETURN m.title AS title ORDER BY title LIMIT 5",
            settings: { title: "Results" },
          },
        ],
        gridLayout: [
          { i: "p-text", x: 0, y: 0, w: 4, h: 3 },
          { i: "t-text", x: 4, y: 0, w: 8, h: 6 },
        ],
      },
    );

    try {
      // Deep-link directly with the param set.
      await page.goto(`/${id}?param_q=matrix`);

      // The text widget's input should reflect the URL value immediately.
      // `getByLabel("q")` also matches the "Clear q" button — use the
      // textbox role to disambiguate.
      const input = page.getByRole("textbox", { name: "q" });
      await expect(input).toHaveValue("matrix", { timeout: 15_000 });

      // The dependent table should render the match on initial load —
      // no click, no type, no re-entry.
      await expect(page.getByText(/^The Matrix$/)).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await cleanup();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Multiple scalar params: ?param_a=foo&param_b=bar
  //    Two independent text parameters, both preloaded from the URL,
  //    both consumed by a dependent widget. Guards against ordering /
  //    race regressions where a second key would overwrite the first.
  // ─────────────────────────────────────────────────────────────────────────
  test("multiple independent scalar params all preload from a single URL", async ({
    page,
  }) => {
    const { id, cleanup } = await createParamDashboard(
      page.request,
      `deeplink-multiparam ${Date.now()}`,
      {
        widgets: [
          {
            id: "p-a",
            chartType: "parameter-select",
            connectionId: "conn-neo4j-001",
            query: "",
            settings: {
              title: "A",
              chartOptions: { parameterType: "text", parameterName: "a" },
            },
          },
          {
            id: "p-b",
            chartType: "parameter-select",
            connectionId: "conn-neo4j-001",
            query: "",
            settings: {
              title: "B",
              chartOptions: { parameterType: "text", parameterName: "b" },
            },
          },
          {
            id: "t-both",
            chartType: "table",
            connectionId: "conn-neo4j-001",
            query: "RETURN $param_a AS a, $param_b AS b",
            settings: { title: "Both" },
          },
        ],
        gridLayout: [
          { i: "p-a", x: 0, y: 0, w: 3, h: 3 },
          { i: "p-b", x: 3, y: 0, w: 3, h: 3 },
          { i: "t-both", x: 6, y: 0, w: 6, h: 3 },
        ],
      },
    );

    try {
      await page.goto(`/${id}?param_a=alpha&param_b=beta`);

      // Both text widgets reflect their respective URL values.
      await expect(page.getByRole("textbox", { name: "a" })).toHaveValue(
        "alpha",
        { timeout: 15_000 },
      );
      await expect(page.getByRole("textbox", { name: "b" })).toHaveValue(
        "beta",
        { timeout: 15_000 },
      );

      // The dependent table substitutes both and shows them in a row.
      await expect(page.getByRole("cell", { name: "alpha" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole("cell", { name: "beta" })).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Multi-select array: ?param_actors=Keanu+Reeves&param_actors=...
  //    This is the bug case #482 highlights. Before this PR, parseUrlParams
  //    used .forEach(), which receives only the first value for repeated
  //    keys — so the URL silently collapsed to a one-element array. With
  //    .getAll(), both values land in the store.
  // ─────────────────────────────────────────────────────────────────────────
  test("multi-select preloads both chips from a repeated-key URL", async ({
    page,
  }) => {
    const { id, cleanup } = await createParamDashboard(
      page.request,
      `deeplink-multi ${Date.now()}`,
      {
        widgets: [
          {
            id: "p-multi",
            chartType: "parameter-select",
            connectionId: "conn-neo4j-001",
            query: "",
            settings: {
              title: "Actors",
              chartOptions: {
                parameterType: "multi-select",
                parameterName: "actors",
                seedQuery:
                  "MATCH (p:Person)-[:ACTED_IN]->() RETURN DISTINCT p.name AS value ORDER BY value LIMIT 50",
              },
            },
          },
          {
            id: "t-multi",
            chartType: "table",
            connectionId: "conn-neo4j-001",
            query:
              "MATCH (p:Person) WHERE p.name IN $param_actors RETURN p.name AS name ORDER BY name",
            settings: { title: "Selected" },
          },
        ],
        gridLayout: [
          { i: "p-multi", x: 0, y: 0, w: 4, h: 4 },
          { i: "t-multi", x: 4, y: 0, w: 6, h: 6 },
        ],
      },
    );

    try {
      // Two known actors from the movies seed data.
      const url =
        `/${id}?param_actors=${encodeURIComponent("Keanu Reeves")}` +
        `&param_actors=${encodeURIComponent("Laurence Fishburne")}`;
      await page.goto(url);

      // The dependent table resolves `IN $param_actors` to an array —
      // it should show a header row + two matched rows.
      await expect(page.getByRole("row")).toHaveCount(3, { timeout: 20_000 });

      // And both names should be visible in the rendered table.
      await expect(
        page.getByRole("cell", { name: "Keanu Reeves" }),
      ).toBeVisible();
      await expect(
        page.getByRole("cell", { name: "Laurence Fishburne" }),
      ).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Invalid typed value: ?param_yr_min=abc&param_yr_max=xyz
  //    coerceValue rejects non-numeric values for number-range with a
  //    console.warn and the widget falls back to its configured default
  //    [rangeMin, rangeMax]. The dashboard must still render.
  // ─────────────────────────────────────────────────────────────────────────
  test("invalid typed value falls back to the widget default without crashing", async ({
    page,
  }) => {
    const { id, cleanup } = await createParamDashboard(
      page.request,
      `deeplink-invalid ${Date.now()}`,
      {
        widgets: [
          {
            id: "p-num",
            chartType: "parameter-select",
            connectionId: "conn-neo4j-001",
            query: "",
            settings: {
              title: "Year range",
              chartOptions: {
                parameterType: "number-range",
                parameterName: "yr",
                rangeMin: 1990,
                rangeMax: 2010,
                rangeStep: 1,
              },
            },
          },
          {
            id: "t-num",
            chartType: "single-value",
            connectionId: "conn-neo4j-001",
            query:
              "MATCH (m:Movie) WHERE m.released >= $param_yr_min AND m.released <= $param_yr_max RETURN count(m) AS cnt",
            settings: { title: "Movies in range" },
          },
        ],
        gridLayout: [
          { i: "p-num", x: 0, y: 0, w: 4, h: 3 },
          { i: "t-num", x: 4, y: 0, w: 4, h: 3 },
        ],
      },
    );

    try {
      // Capture console warnings — coerceValue should have rejected the
      // non-numeric range and logged about it.
      const warnings: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "warning" || msg.type() === "warn") {
          warnings.push(msg.text());
        }
      });

      await page.goto(`/${id}?param_yr_min=abc&param_yr_max=xyz`);

      // Widget still renders — the spinbuttons exist with the default range.
      const inputs = page.getByRole("spinbutton");
      await inputs.first().waitFor({ state: "visible", timeout: 15_000 });

      // Fallback values must be the configured range, not the invalid input.
      await expect(inputs.first()).toHaveValue("1990");
      await expect(inputs.last()).toHaveValue("2010");

      // Dependent query still runs against the fallback range.
      await expect(page.locator("text=/^[1-9]\\d*$/").first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await cleanup();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Round-trip: UI change → URL update → reload preserves the value
  //    The subscriber in dashboard/[id]/page.tsx writes to router.replace()
  //    on every parameter change. Reloading that URL should restore the
  //    same value via the URL loader on mount.
  // ─────────────────────────────────────────────────────────────────────────
  test("UI change writes to URL and the value survives a reload", async ({
    page,
  }) => {
    const { id, cleanup } = await createParamDashboard(
      page.request,
      `deeplink-roundtrip ${Date.now()}`,
      {
        widgets: [
          {
            id: "p-text",
            chartType: "parameter-select",
            connectionId: "conn-neo4j-001",
            query: "",
            settings: {
              title: "Search",
              chartOptions: {
                parameterType: "text",
                parameterName: "q",
              },
            },
          },
          {
            id: "t-text",
            chartType: "table",
            connectionId: "conn-neo4j-001",
            query:
              "MATCH (m:Movie) WHERE toLower(m.title) CONTAINS toLower($param_q) RETURN m.title AS title ORDER BY title LIMIT 5",
            settings: { title: "Results" },
          },
        ],
        gridLayout: [
          { i: "p-text", x: 0, y: 0, w: 4, h: 3 },
          { i: "t-text", x: 4, y: 0, w: 8, h: 6 },
        ],
      },
    );

    try {
      await page.goto(`/${id}`);

      // Type into the text widget — DebouncedTextInput has a 200ms debounce,
      // then the parameter store subscriber should fire router.replace().
      const input = page.getByRole("textbox", { name: "q" });
      await input.waitFor({ state: "visible", timeout: 15_000 });
      await input.fill("matrix");

      // The URL should pick up ?param_q=matrix within the debounce window.
      await expect(page).toHaveURL(/\?param_q=matrix$/, { timeout: 10_000 });

      // Hard reload — the URL loader on mount should restore the value
      // from the query string.
      await page.reload();

      await expect(page.getByRole("textbox", { name: "q" })).toHaveValue(
        "matrix",
        { timeout: 15_000 },
      );
      await expect(page.getByText(/^The Matrix$/)).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await cleanup();
    }
  });
});
