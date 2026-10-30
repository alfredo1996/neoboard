import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { getChartOptions } from "@neoboard/components";
import { parameterSelectSettingsSchema } from "../settings";

// The preset names live in three places: the editor's option list, the schema
// enums and the CSS rules. This holds them together (#2368).
const parameterSelectOptions = getChartOptions("parameter-select");
const root = resolve(__dirname, "../../../../../component");
const css = readFileSync(resolve(root, "design-tokens.css"), "utf8");
const contrast = readFileSync(
  resolve(root, "src/lib/__tests__/tonal-contrast.test.ts"),
  "utf8",
);

describe.each([
  ["fieldFill", "data-field-fill", "FILLS", "--param-fill-"],
  ["fieldBorder", "data-field-border", "BORDERS", "--param-border-"],
])("%s presets", (key, attr, list, tokenPrefix) => {
  const values = (
    parameterSelectOptions.find((o) => o.key === key)?.options ?? []
  ).map((o) => o.value);
  const named = values.filter((v) => v !== "default");
  const tested = [
    ...(
      contrast.match(new RegExp(`const ${list} = \\[([^\\]]*)\\]`))?.[1] ?? ""
    ).matchAll(/"(\w+)"/g),
  ].map((m) => m[1]);

  it("offers a default plus named presets", () => {
    expect(values[0]).toBe("default");
    expect(named.length).toBeGreaterThan(0);
  });

  it.each(values)("%s parses to itself through the schema", (value) => {
    const parsed = parameterSelectSettingsSchema.parse({
      parameterName: "p",
      [key]: value,
    });
    expect(parsed[key as "fieldFill" | "fieldBorder"]).toBe(value);
  });

  it("every named preset has its CSS rule, both themes' tokens and a contrast check", () => {
    for (const v of named) {
      expect(css).toContain(`[${attr}="${v}"]`);
      expect(css.split(`${tokenPrefix}${v}:`).length - 1).toBe(2);
    }
    expect(tested).toEqual(named);
  });
});
