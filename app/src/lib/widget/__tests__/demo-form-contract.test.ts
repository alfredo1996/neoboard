import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildFormParams, type FormFieldDef } from "../form-field-def";

/**
 * Contract guard for the demo showcase form widgets (#1164).
 *
 * A form widget's write query references params as `$param_<name>`. Those
 * params are produced by `buildFormParams` from the widget's `formFields`.
 * Different field types emit different param names — notably a `number-range`
 * field for parameter `x` emits `param_x_min` / `param_x_max`, NOT `param_x`.
 *
 * The bug: chart-playground's feedback form used a `number-range` rating field
 * but the INSERT referenced `$param_pg_rating`, which was never produced →
 * `null` → NOT-NULL violation. This test fails if any seeded form widget
 * references a `$param_*` its own fields can't produce.
 */

const DEMO_DIR = join(process.cwd(), "..", "scripts", "demo");

/** A non-empty representative value per parameter type, so buildFormParams emits the param. */
function dummyValue(field: FormFieldDef): unknown {
  switch (field.parameterType) {
    case "number-range":
      return [field.rangeMin ?? 0, field.rangeMax ?? 1];
    case "date-range":
      return { from: "2020-01-01", to: "2020-12-31" };
    case "multi-select":
      return ["a"];
    default:
      return "x";
  }
}

interface Widget {
  chartType?: string;
  query?: string;
  settings?: { formFields?: FormFieldDef[] };
}

function collectFormWidgets(node: unknown, out: Widget[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectFormWidgets(n, out);
  } else if (node && typeof node === "object") {
    const w = node as Widget;
    if (w.chartType === "form" && typeof w.query === "string") out.push(w);
    for (const v of Object.values(node)) collectFormWidgets(v, out);
  }
}

const demoFiles = readdirSync(DEMO_DIR).filter((f) => f.endsWith(".json"));

describe("demo form widgets — query params are producible from fields (#1164)", () => {
  it("discovers at least one form widget across the showcases", () => {
    const all: Widget[] = [];
    for (const f of demoFiles) {
      collectFormWidgets(
        JSON.parse(readFileSync(join(DEMO_DIR, f), "utf8")),
        all,
      );
    }
    expect(all.length).toBeGreaterThan(0);
  });

  for (const file of demoFiles) {
    const widgets: Widget[] = [];
    collectFormWidgets(
      JSON.parse(readFileSync(join(DEMO_DIR, file), "utf8")),
      widgets,
    );

    for (const w of widgets) {
      const fields = w.settings?.formFields ?? [];
      it(`${file}: every $param_* in "${(w.query ?? "").slice(0, 40)}…" is produced by its fields`, () => {
        const referenced = new Set(
          Array.from((w.query ?? "").matchAll(/\$param_(\w+)/g)).map(
            (m) => `param_${m[1]}`,
          ),
        );
        const values: Record<string, unknown> = {};
        for (const f of fields) values[f.parameterName] = dummyValue(f);
        const produced = new Set(Object.keys(buildFormParams(fields, values)));

        const missing = [...referenced].filter((p) => !produced.has(p));
        expect(missing, `unproducible params: ${missing.join(", ")}`).toEqual(
          [],
        );
      });
    }
  }
});
