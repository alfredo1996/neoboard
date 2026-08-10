/**
 * Single-value chart data transform and validator.
 */

import { toRecords, normalizeValue } from "../transforms/shared-utils";

export interface SingleValueData {
  /** The headline value. */
  value: string | number;
  /** Second row's value in the same column, when numeric — drives the trend. */
  previous?: number;
}

/** Coerce a cell to a finite number, or null. */
function toNumber(raw: unknown): number | null {
  const v = normalizeValue(raw);
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Transform to a single value for SingleValueChart.
 *
 * Picks the first **numeric** column rather than the positionally first one
 * (#1397). The editor tells users the trend indicator "requires 2 rows in the
 * query result", so the natural query is `label, value` — and taking column one
 * positionally rendered the *label* as the headline metric, e.g. a KPI reading
 * `$2026-03`. A non-numeric column is still returned when the result has no
 * numeric column at all, which is the legitimate "status text" case.
 *
 * The second row's value in the same column is exposed as `previous` so the
 * plugin can compute a trend; the scalar alone cannot express one.
 */
export function transformToValueData(data: unknown): SingleValueData {
  const records = toRecords(data);
  if (records.length > 0) {
    const first = records[0];
    const keys = Object.keys(first);
    const numericKey = keys.find((k) => toNumber(first[k]) !== null);
    const key = numericKey ?? keys[0];

    const raw = key === undefined ? undefined : first[key];
    const value =
      (numericKey ? toNumber(raw) : (normalizeValue(raw) ?? 0)) ?? 0;

    const previous =
      records.length > 1 && key !== undefined
        ? (toNumber(records[1][key]) ?? undefined)
        : undefined;

    return { value: value as string | number, previous };
  }
  if (typeof data === "number" || typeof data === "string")
    return { value: data };
  return { value: 0 };
}

/**
 * Validates raw data shape for single-value charts.
 * Returns null if valid or empty, error string if rows exist but shape is wrong.
 */
export function validateValueData(data: unknown): string | null {
  const records = toRecords(data);
  if (!records.length) {
    if (typeof data === "number" || typeof data === "string") return null;
    return null; // empty = "No data" state, not format error
  }
  const first = records[0];
  const values = Object.values(first);
  if (!values.length)
    return "Single value chart requires at least 1 column with a scalar value (number or string). Your query returned no usable values.";
  return null;
}
