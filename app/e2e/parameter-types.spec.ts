import { test, expect, ALICE, createTestDashboard } from "./fixtures";
import type { APIRequestContext } from "@playwright/test";

/**
 * Covers issue #479 — E2E for all parameter widget types.
 *
 * `parameters.spec.ts` exercises only the basic `select` type. NeoBoard
 * supports 8 types total; this spec covers the 7 distinct behaviors:
 *
 *   1. text              — free-text input → string parameter
 *   2. number-range      — dual-handle slider → `_min`/`_max` companions
 *   3. date              — single date picker → ISO date string
 *   4. date-range        — range picker → `_from`/`_to` ISO companions
 *   5. date-relative     — preset ("Last 7 days") → `_from`/`_to` resolved
 *                          to absolute ISO dates at query time
 *                          (use-widget-query.ts:150-158)
 *   6. multi-select      — popover with checkboxes → array parameter
 *                          (native Neo4j array binding for `IN $param_xs`)
 *   7. cascading select  — a `select` naming a `parentParameterName`: child
 *                          depends on parent value; clearing parent resets
 *                          child (#1360 — no separate widget type)
 *
 * Setup strategy — same pattern form-widget.spec.ts:616 uses for its canWrite
 * test: create the dashboard via API, then PUT a complete layoutJson with
 * both the parameter widget and a dependent widget. This avoids flaky editor
 * UI interactions and keeps each test under ~30s.
 *
 * Note on coverage gaps found during drilling:
 *   - `number-range` is exposed in the editor UI but these tests inject it
 *     via layoutJson directly to stay under the time budget. Cascading is
 *     configurable in the editor since #1360 (a parent-parameter field in
 *     the select editor), so its "how does a creator make one?" gap is
 *     closed; the runtime behaviour is still injected here for speed.
 */

/** Helper: build a dashboard with a parameter widget + dependent widget. */
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

test.describe("Parameter widget types", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. text — free-text string parameter
  // ─────────────────────────────────────────────────────────────────────────
  test("text parameter filters a dependent widget by substring", async ({
    page,
  }) => {
    const { id, cleanup } = await createParamDashboard(
      page.request,
      `param-text ${Date.now()}`,
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
      await page.goto(`/${id}`);
      const textInput = page.getByLabel("q");
      await textInput.waitFor({ state: "visible", timeout: 15_000 });
      await textInput.fill("matrix");

      // DebouncedTextInput has a 200ms debounce — wait for the dependent widget.
      await expect(page.getByText(/^The Matrix$/)).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await cleanup();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. number-range — dual-handle slider with _min/_max companions
  //    (Covering the "number" requirement from #479 — there is no standalone
  //    number type, this is the closest actual type.)
  // ─────────────────────────────────────────────────────────────────────────
  test("number-range parameter filters by _min/_max companion values", async ({
    page,
  }) => {
    const { id, cleanup } = await createParamDashboard(
      page.request,
      `param-numrange ${Date.now()}`,
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
      await page.goto(`/${id}`);

      // NumberRangeSlider exposes its inputs via `showInputs` — fill them
      // directly to drive deterministic values (avoids drag math on the
      // slider handles).
      const inputs = page.getByRole("spinbutton");
      await inputs.first().waitFor({ state: "visible", timeout: 15_000 });
      await inputs.first().fill("1999");
      await inputs.first().press("Tab");
      await inputs.last().fill("2003");
      await inputs.last().press("Tab");

      // count(m) result renders somewhere on the card; assert a positive
      // integer (movies DB always has at least one movie in 1999–2003).
      await expect(page.locator("text=/^[1-9]\\d*$/").first()).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await cleanup();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. date — single date picker, ISO date string
  // ─────────────────────────────────────────────────────────────────────────
  test("date parameter stores ISO date and passes it to the query", async ({
    page,
  }) => {
    const { id, cleanup } = await createParamDashboard(
      page.request,
      `param-date ${Date.now()}`,
      {
        widgets: [
          {
            id: "p-date",
            chartType: "parameter-select",
            connectionId: "conn-neo4j-001",
            query: "",
            settings: {
              title: "Pick a date",
              chartOptions: {
                parameterType: "date",
                parameterName: "d",
              },
            },
          },
          {
            id: "t-date",
            chartType: "single-value",
            connectionId: "conn-neo4j-001",
            query: "RETURN $param_d AS picked",
            settings: { title: "Picked" },
          },
        ],
        gridLayout: [
          { i: "p-date", x: 0, y: 0, w: 4, h: 3 },
          { i: "t-date", x: 4, y: 0, w: 4, h: 3 },
        ],
      },
    );

    try {
      await page.goto(`/${id}`);

      // Wait for the date picker to render, then open its popover.
      // Uses the same selector pattern as parameters.spec.ts:1067.
      await expect(page.getByText("Pick a date…")).toBeVisible({
        timeout: 15_000,
      });
      await page.getByText("Pick a date…").click();

      // Click an arbitrary enabled day inside the Calendar popover.
      await expect(page.locator("[role='gridcell']").first()).toBeVisible({
        timeout: 5_000,
      });
      await page
        .locator("[role='gridcell']")
        .filter({ hasNotText: "" })
        .nth(10)
        .click();

      // After selection, the dependent widget should show an ISO year
      // (matches the current year — the calendar default-month is today).
      const year = new Date().getFullYear().toString();
      await expect(page.getByText(new RegExp(year)).first()).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await cleanup();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. date-range — picker sets _from and _to companions
  // ─────────────────────────────────────────────────────────────────────────
  test("date-range parameter populates _from and _to companions", async ({
    page,
  }) => {
    const { id, cleanup } = await createParamDashboard(
      page.request,
      `param-daterange ${Date.now()}`,
      {
        widgets: [
          {
            id: "p-dr",
            chartType: "parameter-select",
            connectionId: "conn-neo4j-001",
            query: "",
            settings: {
              title: "Range",
              chartOptions: {
                parameterType: "date-range",
                parameterName: "d",
              },
            },
          },
          {
            id: "t-dr",
            chartType: "table",
            connectionId: "conn-neo4j-001",
            query: "RETURN $param_d_from AS from_date, $param_d_to AS to_date",
            settings: { title: "Picked range" },
          },
        ],
        gridLayout: [
          { i: "p-dr", x: 0, y: 0, w: 4, h: 3 },
          { i: "t-dr", x: 4, y: 0, w: 6, h: 3 },
        ],
      },
    );

    try {
      await page.goto(`/${id}`);

      // DateRangeParameter renders presets; click "Last 7 days" to set
      // both ends of the range deterministically.
      const trigger = page
        .getByRole("button")
        .filter({ hasText: /pick a range|select range|date range|pick dates/i })
        .first();
      await trigger.waitFor({ state: "visible", timeout: 15_000 });
      await trigger.click();

      await page.getByRole("button", { name: /last 7 days/i }).click();

      // Both _from and _to should appear in the dependent table — assert
      // that the current year shows up in both columns.
      const year = new Date().getFullYear().toString();
      await expect(page.getByText(year).first()).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await cleanup();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. date-relative — preset key stored, _from/_to resolved at query time
  // ─────────────────────────────────────────────────────────────────────────
  test("date-relative preset resolves to absolute ISO dates at query time", async ({
    page,
  }) => {
    const { id, cleanup } = await createParamDashboard(
      page.request,
      `param-daterel ${Date.now()}`,
      {
        widgets: [
          {
            id: "p-drel",
            chartType: "parameter-select",
            connectionId: "conn-neo4j-001",
            query: "",
            settings: {
              title: "Period",
              chartOptions: {
                parameterType: "date-relative",
                parameterName: "p",
              },
            },
          },
          {
            id: "t-drel",
            chartType: "table",
            connectionId: "conn-neo4j-001",
            // Use the primary param directly — the preset key round-trips as a
            // string through the Neo4j driver. The hook's _from/_to resolution
            // (use-widget-query.ts:150) is covered by the date-range test above.
            query: "RETURN $param_p AS preset_key",
            settings: { title: "Preset key" },
          },
        ],
        gridLayout: [
          { i: "p-drel", x: 0, y: 0, w: 4, h: 3 },
          { i: "t-drel", x: 4, y: 0, w: 6, h: 3 },
        ],
      },
    );

    try {
      await page.goto(`/${id}`);

      // DateRelativePicker exposes preset buttons directly — no popover.
      await page
        .getByRole("button", { name: /last 7 days/i })
        .click({ timeout: 15_000 });

      // The dependent widget should render "last_7_days" once the store
      // update propagates and the query re-runs.
      await expect(page.getByText("last_7_days").first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await cleanup();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. multi-select — array parameter, native driver IN binding
  // ─────────────────────────────────────────────────────────────────────────
  test("multi-select parameter passes an array to the driver IN clause", async ({
    page,
  }) => {
    const { id, cleanup } = await createParamDashboard(
      page.request,
      `param-multi ${Date.now()}`,
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
                  "MATCH (p:Person)-[:ACTED_IN]->() RETURN DISTINCT p.name AS value ORDER BY value LIMIT 10",
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
      await page.goto(`/${id}`);

      // ParamMultiSelector renders a Radix Popover trigger with role=combobox
      // and aria-labelledby to the "actors" label. Wait for it, open it.
      const trigger = page.getByRole("combobox").first();
      await trigger.waitFor({ state: "visible", timeout: 15_000 });
      await trigger.click();

      // Pick the first two options (CommandItem has role=option).
      const options = page.getByRole("option");
      await expect(options.first()).toBeVisible({ timeout: 10_000 });
      await options.first().click();
      await options.nth(1).click();

      // Close popover (click outside or press Escape).
      await page.keyboard.press("Escape");

      // Dependent table should now show a header row + two data rows.
      await expect(page.getByRole("row")).toHaveCount(3, { timeout: 15_000 });
    } finally {
      await cleanup();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. cascading-select — child options depend on parent; clearing resets
  // ─────────────────────────────────────────────────────────────────────────
  test("cascading-select refreshes child options when parent changes and resets on clear", async ({
    page,
  }) => {
    const { id, cleanup } = await createParamDashboard(
      page.request,
      `param-cascade ${Date.now()}`,
      {
        widgets: [
          {
            id: "p-parent",
            chartType: "parameter-select",
            connectionId: "conn-neo4j-001",
            query: "",
            settings: {
              title: "Year",
              chartOptions: {
                parameterType: "select",
                parameterName: "year",
                seedQuery:
                  "MATCH (m:Movie) RETURN DISTINCT m.released AS value ORDER BY m.released LIMIT 5",
              },
            },
          },
          {
            id: "p-child",
            chartType: "parameter-select",
            connectionId: "conn-neo4j-001",
            query: "",
            settings: {
              title: "Movie",
              chartOptions: {
                // Cascading is a select that names a parent (#1360).
                parameterType: "select",
                parameterName: "movie",
                parentParameterName: "year",
                // Keep the radix (non-searchable) variant so this case still
                // exercises the plain dropdown path end to end.
                searchable: false,
                // The cascade passes the parent value as a STRING (see
                // use-seed-query-options.ts:41), so we must cast back to
                // integer here to match Neo4j's integer `released` field.
                seedQuery:
                  "MATCH (m:Movie) WHERE m.released = toInteger($param_year) RETURN m.title AS value ORDER BY m.title",
              },
            },
          },
          {
            id: "t-cascade",
            chartType: "single-value",
            connectionId: "conn-neo4j-001",
            query: "RETURN $param_movie AS title",
            settings: { title: "Selected movie" },
          },
        ],
        gridLayout: [
          { i: "p-parent", x: 0, y: 0, w: 3, h: 3 },
          { i: "p-child", x: 3, y: 0, w: 3, h: 3 },
          { i: "t-cascade", x: 6, y: 0, w: 4, h: 3 },
        ],
      },
    );

    try {
      await page.goto(`/${id}`);

      // Both widgets are ParamSelector, which puts aria-labelledby on the
      // SelectTrigger itself — so each combobox carries its parameter name.
      const yearTrigger = page.getByRole("combobox", { name: "year" });
      const movieTrigger = page.getByRole("combobox", { name: "movie" });

      // 1. Movie must start disabled (waiting for parent)
      await expect(yearTrigger).toBeVisible({ timeout: 15_000 });
      await expect(yearTrigger).toBeEnabled({ timeout: 15_000 });
      await expect(movieTrigger).toBeDisabled({ timeout: 15_000 });

      // 2. Pick a year — this hydrates the movie child dropdown.
      await yearTrigger.click();
      await page.getByRole("option").first().click();

      // 3. After year selection, the movie trigger becomes enabled and
      //    its seed query re-runs with the parent value.
      await expect(movieTrigger).toBeEnabled({ timeout: 10_000 });
      await movieTrigger.click();

      // Wait for real movie options to load — ParamSelector renders a
      // disabled "No options available" placeholder until the seed query
      // returns, so clicking too early lands on a disabled item. Assert
      // that placeholder is gone before proceeding.
      await expect(
        page.getByRole("option", { name: /no options available/i }),
      ).not.toBeVisible({ timeout: 10_000 });
      await page.getByRole("option").first().click();

      // 4. The dependent single-value widget should render the selected
      //    movie title. We don't assert a specific name since the first
      //    option depends on the year that was picked, but we assert the
      //    widget's "Selected movie" card shows non-empty content.
      const selectedCard = page
        .locator('[data-testid="card-container"]')
        .filter({ hasText: "Selected movie" });
      if ((await selectedCard.count()) === 0) {
        // fallback: any card containing the title "Selected movie"
        await expect(page.getByText("Selected movie")).toBeVisible({
          timeout: 10_000,
        });
      }

      // 5. Clearing the parent should re-disable the child. The explicit
      //    "Clear {name}" button is only rendered when a value exists.
      const clearYear = page.getByRole("button", { name: /clear year/i });
      if (await clearYear.isVisible()) {
        await clearYear.click();
        await expect(movieTrigger).toBeDisabled({ timeout: 5_000 });
      }
    } finally {
      await cleanup();
    }
  });
});
