import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { extractParamDefaults } from "@/lib/parameter/apply-param-defaults";
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
    expect(extractParamDefaults(layout)).toEqual({});
  });

  it("extracts default value from parameter-select widget", () => {
    const layout = makeLayout([
      {
        chartType: "parameter-select",
        chartOptions: { parameterName: "year", defaultValue: "2024" },
      },
    ]);
    expect(extractParamDefaults(layout)).toEqual({ year: "2024" });
  });

  it("skips parameter widgets without defaultValue", () => {
    const layout = makeLayout([
      {
        chartType: "parameter-select",
        chartOptions: { parameterName: "dept" },
      },
    ]);
    expect(extractParamDefaults(layout)).toEqual({});
  });

  it("skips parameter widgets with empty defaultValue", () => {
    const layout = makeLayout([
      {
        chartType: "parameter-select",
        chartOptions: { parameterName: "dept", defaultValue: "" },
      },
    ]);
    expect(extractParamDefaults(layout)).toEqual({});
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
    expect(extractParamDefaults(layout)).toEqual({
      year: "2024",
      dept: "Sales",
    });
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
  it("is imported by non-test source", () => {
    const appSrc = join(__dirname, "../../..");
    const hits = execFileSync(
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
      .filter(Boolean)
      .filter((f) => !f.includes("apply-param-defaults.ts"))
      .filter((f) => !f.includes("__tests__") && !f.includes(".test."));

    expect(
      hits,
      "extractParamDefaults has no production caller — the Default value field would silently do nothing",
    ).not.toEqual([]);
  });
});
