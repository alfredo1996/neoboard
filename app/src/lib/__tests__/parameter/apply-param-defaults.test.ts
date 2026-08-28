import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractParamDefaults,
  expandParamDefaults,
} from "@/lib/parameter/apply-param-defaults";
import type { DashboardLayoutV2 } from "@/lib/db/schema";

function makeLayout(
  widgets: Array<{ chartType: string; chartOptions?: Record<string, unknown> }>,
): DashboardLayoutV2 {
  return {
    version: 2,
    pages: [
      {
        id: "p1",
        title: "Page 1",
        widgets: widgets.map((w, i) => ({
          id: `w${i}`,
          chartType: w.chartType,
          connectionId: "",
          query: "",
          settings: { chartOptions: w.chartOptions ?? {} },
        })),
        gridLayout: [],
      },
    ],
  };
}

describe("extractParamDefaults", () => {
  it("returns empty for layout with no parameter widgets", () => {
    const layout = makeLayout([{ chartType: "bar" }, { chartType: "table" }]);
    expect(extractParamDefaults(layout)).toEqual([]);
  });

  it("extracts default value from parameter-select widget", () => {
    const layout = makeLayout([
      {
        chartType: "parameter-select",
        chartOptions: { parameterName: "year", defaultValue: "2024" },
      },
    ]);
    expect(extractParamDefaults(layout)).toEqual([
      { name: "year", value: "2024", type: "select", widgetId: "w0" },
    ]);
  });

  it("skips parameter widgets without defaultValue", () => {
    const layout = makeLayout([
      {
        chartType: "parameter-select",
        chartOptions: { parameterName: "dept" },
      },
    ]);
    expect(extractParamDefaults(layout)).toEqual([]);
  });

  it("skips parameter widgets with empty defaultValue", () => {
    const layout = makeLayout([
      {
        chartType: "parameter-select",
        chartOptions: { parameterName: "dept", defaultValue: "" },
      },
    ]);
    expect(extractParamDefaults(layout)).toEqual([]);
  });

  // ── #1517 ────────────────────────────────────────────────────────────────
  // The type was discarded and every default was applied as "text", so a
  // number-range's `_min`/`_max` companions were never seeded and a
  // multi-select default reached the store as a bare string.

  it("carries the widget's parameterType, not a hardcoded text", () => {
    const layout = makeLayout([
      {
        chartType: "parameter-select",
        chartOptions: {
          parameterName: "tags",
          parameterType: "multi-select",
          defaultValue: "alpha",
        },
      },
    ]);
    expect(extractParamDefaults(layout)).toEqual([
      { name: "tags", value: "alpha", type: "multi-select", widgetId: "w0" },
    ]);
  });

  it("carries rangeMin for a number-range so companions can be seeded", () => {
    const layout = makeLayout([
      {
        chartType: "parameter-select",
        chartOptions: {
          parameterName: "window",
          parameterType: "number-range",
          defaultValue: "180",
          rangeMin: 30,
          rangeMax: 365,
        },
      },
    ]);
    expect(extractParamDefaults(layout)).toEqual([
      {
        name: "window",
        value: "180",
        type: "number-range",
        widgetId: "w0",
        rangeMin: 30,
      },
    ]);
  });

  it("defaults rangeMin to 0 when the widget omits it", () => {
    const layout = makeLayout([
      {
        chartType: "parameter-select",
        chartOptions: {
          parameterName: "n",
          parameterType: "number-range",
          defaultValue: "5",
        },
      },
    ]);
    expect(extractParamDefaults(layout)).toEqual([
      {
        name: "n",
        value: "5",
        type: "number-range",
        widgetId: "w0",
        rangeMin: 0,
      },
    ]);
  });

  it("falls back to select when parameterType is absent", () => {
    const layout = makeLayout([
      {
        chartType: "parameter-select",
        chartOptions: { parameterName: "x", defaultValue: "1" },
      },
    ]);
    expect(extractParamDefaults(layout)[0].type).toBe("select");
  });

  it("extracts defaults from multiple pages", () => {
    const layout: DashboardLayoutV2 = {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "P1",
          gridLayout: [],
          widgets: [
            {
              id: "w1",
              chartType: "parameter-select",
              connectionId: "",
              query: "",
              settings: {
                chartOptions: { parameterName: "year", defaultValue: "2024" },
              },
            },
          ],
        },
        {
          id: "p2",
          title: "P2",
          gridLayout: [],
          widgets: [
            {
              id: "w2",
              chartType: "parameter-select",
              connectionId: "",
              query: "",
              settings: {
                chartOptions: { parameterName: "dept", defaultValue: "Sales" },
              },
            },
          ],
        },
      ],
    };
    expect(extractParamDefaults(layout)).toEqual([
      { name: "year", value: "2024", type: "select", widgetId: "w1" },
      { name: "dept", value: "Sales", type: "select", widgetId: "w2" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// #1517 — expanding a configured default into the store entries it implies.
// ---------------------------------------------------------------------------

describe("expandParamDefaults", () => {
  it("passes a select default through as a single entry", () => {
    expect(
      expandParamDefaults([
        { name: "dept", value: "Sales", type: "select", widgetId: "w0" },
      ]),
    ).toEqual([
      { name: "dept", value: "Sales", type: "select", widgetId: "w0" },
    ]);
  });

  // The whole of #1517: queries read `_min`/`_max`, and neither was ever set,
  // so every widget gated on one showed nothing until the slider was dragged.
  it("expands a number-range into the tuple plus _min and _max companions", () => {
    expect(
      expandParamDefaults([
        {
          name: "window",
          value: "180",
          type: "number-range",
          widgetId: "w0",
          rangeMin: 30,
        },
      ]),
    ).toEqual([
      {
        name: "window",
        value: [30, 180],
        type: "number-range",
        widgetId: "w0",
      },
      { name: "window_min", value: 30, type: "text", widgetId: "w0" },
      { name: "window_max", value: 180, type: "text", widgetId: "w0" },
    ]);
  });

  it("treats the configured default as the upper bound", () => {
    const seeds = expandParamDefaults([
      {
        name: "n",
        value: "12",
        type: "number-range",
        widgetId: "w0",
        rangeMin: 5,
      },
    ]);
    expect(seeds.find((s) => s.name === "n_max")?.value).toBe(12);
    expect(seeds.find((s) => s.name === "n_min")?.value).toBe(5);
  });

  it("uses 0 as the lower bound when rangeMin is absent", () => {
    const seeds = expandParamDefaults([
      { name: "n", value: "9", type: "number-range", widgetId: "w0" },
    ]);
    expect(seeds.find((s) => s.name === "n_min")?.value).toBe(0);
  });

  // Seeding NaN would put a permanently unusable value in the store, and the
  // slider would read it as unset anyway.
  it("drops a number-range whose default is not numeric", () => {
    expect(
      expandParamDefaults([
        { name: "n", value: "abc", type: "number-range", widgetId: "w0" },
      ]),
    ).toEqual([]);
  });

  it("keeps multi-select typed so the store coerces it to an array", () => {
    const [seed] = expandParamDefaults([
      { name: "tags", value: "alpha", type: "multi-select", widgetId: "w0" },
    ]);
    expect(seed.type).toBe("multi-select");
  });

  it("carries the widget id onto every companion, so chips link back", () => {
    const seeds = expandParamDefaults([
      {
        name: "w",
        value: "3",
        type: "number-range",
        widgetId: "widget-7",
        rangeMin: 1,
      },
    ]);
    expect(seeds.map((s) => s.widgetId)).toEqual([
      "widget-7",
      "widget-7",
      "widget-7",
    ]);
  });

  it("expands several defaults in order", () => {
    const seeds = expandParamDefaults([
      { name: "a", value: "1", type: "select", widgetId: "w0" },
      { name: "b", value: "2", type: "number-range", widgetId: "w1" },
    ]);
    expect(seeds.map((s) => s.name)).toEqual(["a", "b", "b_min", "b_max"]);
  });
});

// ---------------------------------------------------------------------------
// #1421 — the helper below was written, unit-tested, and never called.
// ---------------------------------------------------------------------------

describe("extractParamDefaults has a production caller (#1421)", () => {
  /**
   * This function was correct and fully covered while doing nothing, because
   * nothing invoked it: the editor's "Default value" field wrote into the saved
   * layout and was read only by this test file. The seeded Chart Playground
   * carries 21 defaults and showed "Waiting for parameters…" on every chart.
   *
   * A unit test proving a function works is not evidence that anything calls
   * it. This is the third instance of that shape — #1388 (`extractNoSyncParams`)
   * and #1234 (the audit trail) were the first two.
   *
   * Deliberately narrow. The general form — "any `lib/` export reachable only
   * from `__tests__` fails the build" — was measured at ~69 current matches,
   * the great majority legitimate (`_reset*` test hooks, Zod fragments composed
   * in-file, Drizzle enums). Shipping that would mean shipping an allowlist
   * bigger than the signal, so it is filed separately as a tooling change.
   */
  it("is imported and called by non-test source", () => {
    const appSrc = join(__dirname, "../../..");
    let matched: string[];
    try {
      matched = execFileSync(
        "grep",
        [
          "-rl",
          "extractParamDefaults",
          appSrc,
          "--include=*.ts",
          "--include=*.tsx",
        ],
        { encoding: "utf8" },
      )
        .trim()
        .split("\n")
        .filter(Boolean);
    } catch {
      // grep exits 1 on no matches, which would otherwise throw before the
      // assertion and hide the message explaining what broke.
      matched = [];
    }

    // A raw text match is not enough: this file's own explanatory comment names
    // the helper, so a comment alone would satisfy it even with the import and
    // the call deleted. Strip comments, then require both.
    const callers = matched
      .filter((f) => !f.includes("apply-param-defaults.ts"))
      .filter((f) => !f.includes("__tests__") && !f.includes(".test."))
      .filter((f) => {
        const code = readFileSync(f, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        const imported = /import\s*\{[^}]*\bextractParamDefaults\b[^}]*\}/.test(
          code,
        );
        const called = /\bextractParamDefaults\s*\(/.test(code);
        return imported && called;
      });

    expect(
      callers,
      "extractParamDefaults has no production caller — the Default value field would silently do nothing",
    ).not.toEqual([]);
  });
});
