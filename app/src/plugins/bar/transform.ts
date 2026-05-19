/**
 * Bar chart data transform and validator.
 */

import {
  toRecords,
  resolveLabelKey,
  resolveValueKeys,
  normalizeValue,
  collectAllKeys,
  toSeriesNumber,
  type ColumnMapping,
} from "../transforms/shared-utils";

/**
 * Transform to bar chart format: [{ label, series1, series2 }]
 * When mapping is provided, uses mapped columns; otherwise uses positional defaults.
 * Always applies normalizeValue to labels for consistent type handling.
 *
 * Series keys are collected from the *union* of all rows so sparse data
 * (where some series only appear in later rows) isn't silently dropped.
 * Cell values use `toSeriesNumber` to preserve missing-vs-zero distinction.
 */
export function transformToBarData(
  data: unknown,
  mapping?: ColumnMapping,
): unknown {
  const records = toRecords(data);
  if (!records.length) return [];
  const keys = collectAllKeys(records);
  if (keys.length < 2) return [];

  const labelKey = resolveLabelKey(keys, mapping);
  const valueKeys = resolveValueKeys(keys, labelKey, mapping);

  return records.map((r) => {
    const point: Record<string, unknown> = {
      label: String(normalizeValue(r[labelKey]) ?? ""),
    };
    for (const k of valueKeys) {
      point[k] = toSeriesNumber(r[k]);
    }
    return point;
  });
}

/**
 * Validates raw data shape for bar charts.
 * Returns null if valid or empty, error string if rows exist but shape is wrong.
 */
export function validateBarData(data: unknown): string | null {
  const records = toRecords(data);
  if (!records.length) return null;
  const cols = collectAllKeys(records).length;
  if (cols < 2)
    return `Bar chart requires at least 2 columns: first column for category labels (x-axis) and one or more columns for numeric values (y-axis). Your query returned only ${cols} column(s). Example: \`SELECT category, count FROM ...\``;
  return null;
}
