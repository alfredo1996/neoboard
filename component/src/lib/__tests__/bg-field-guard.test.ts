import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `--field` is the fill that says "type here" (#2367). A button, toast or
 * selected segment painted with it reads as a field, so only the field
 * primitives may use `bg-field`, in component/src and app/src alike.
 */
const allowed = new Set([
  "control-sizes.ts",
  "multi-select-field.tsx",
  "checkbox.tsx",
  "radio-group.tsx",
]);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) {
      return e.name === "__tests__" || e.name === "node_modules"
        ? []
        : walk(resolve(dir, e.name));
    }
    return /\.tsx?$/.test(e.name) ? [resolve(dir, e.name)] : [];
  });
}

describe("bg-field belongs to inputs only (#2367)", () => {
  it("no other file in component/src or app/src paints it", () => {
    const offenders = [
      ...walk(resolve(__dirname, "../..")),
      ...walk(resolve(__dirname, "../../../../app/src")),
    ].filter(
      (f) =>
        !allowed.has(f.split("/").pop()!) &&
        /(?<![\w-])bg-field\b/.test(readFileSync(f, "utf8")),
    );
    expect(offenders.map((f) => f.split("/").pop())).toEqual([]);
  });
});
