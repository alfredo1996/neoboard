/**
 * Single-value chart data transform and validator.
 */

import { toRecords, normalizeValue } from "./shared";

/**
 * Transform to a single value for SingleValueChart.
 */
export function transformToValueData(data: unknown): unknown {
  const records = toRecords(data);
  if (records.length > 0) {
    const first = records[0];
    const values = Object.values(first);
    return normalizeValue(values[0]) ?? 0;
  }
  if (typeof data === "number" || typeof data === "string") return data;
  return 0;
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
