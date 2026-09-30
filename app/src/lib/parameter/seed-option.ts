import type { ParamSelectorOption } from "@neoboard/components";
import { normalizeValue } from "@/lib/shared/normalize-value";
import { clickScalar } from "@/lib/widget/resolve-click-action";

/**
 * What an option carries for a cell: a node's `elementId`, as a click sets
 * (#1925), and any other object's JSON text, so no two rows collapse into
 * one "[object Object]" option (#2104).
 */
function seedScalar(v: unknown): string | number | boolean | null {
  return clickScalar(v) ?? normalizeValue(v);
}

/**
 * One seed query row as a selector option. Named `value` and `label` columns
 * win over position, in either order: `RETURN m.title AS label, m.id AS value`.
 * The dashboard selector and the editor's Test Seed Query preview both read
 * rows through this, so the preview shows what the selector will (#2104).
 */
export function seedRowToOption(row: unknown): ParamSelectorOption {
  const r =
    row && typeof row === "object"
      ? (row as Record<string, unknown>)
      : { value: row };
  const keys = Object.keys(r);
  const valueKey = "value" in r ? "value" : (keys[0] ?? "");
  const labelKey = "label" in r ? "label" : (keys[1] ?? valueKey);
  const rawValue = seedScalar(r[valueKey]);
  const value = String(rawValue ?? "");
  return { value, label: String(seedScalar(r[labelKey]) ?? value), rawValue };
}
