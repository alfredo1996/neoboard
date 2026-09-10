/**
 * Single-value chart data transform and validator.
 */

import { toRecords, normalizeValue } from "../transforms/shared-utils";

export interface SingleValueData {
  /** The headline value; null when the metric has no data (#1671). */
  value: string | number | null;
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

/** A cell that carries no value: null, undefined, or blank text. */
function isBlank(raw: unknown): boolean {
  return raw == null || (typeof raw === "string" && raw.trim() === "");
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
 * A column counts as numeric when *any* row is, and a column blank in every row
 * is preferred over a text one: a `LEFT JOIN` KPI with no row for this period
 * is a null metric, and it is no data — not 0, and not the label (#1671).
 *
 * The second row's value in the same column is exposed as `previous` so the
 * plugin can compute a trend; the scalar alone cannot express one.
 */
export function transformToValueData(data: unknown): SingleValueData {
  const records = toRecords(data);
  if (records.length > 0) {
    const keys = Object.keys(records[0]);
    const key =
      keys.find((k) => records.some((r) => toNumber(r[k]) !== null)) ??
      keys.find((k) => records.every((r) => isBlank(r[k]))) ??
      keys[0];

    const raw = key === undefined ? undefined : records[0][key];
    const value = isBlank(raw) ? null : (toNumber(raw) ?? normalizeValue(raw));

    const previous =
      records.length > 1 && key !== undefined
        ? (toNumber(records[1][key]) ?? undefined)
        : undefined;

    return { value: value as string | number | null, previous };
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
