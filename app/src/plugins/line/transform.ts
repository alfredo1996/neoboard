/**
 * Line chart data transform and validator.
 */

import {
  toRecords,
  resolveLabelKey,
  resolveValueKeys,
  normalizeValue,
  collectAllKeys,
  toSeriesNumber,
  validateNumericValueColumns,
  type ColumnMapping,
} from "../transforms/shared-utils";

/**
 * Transform to line chart format: [{ x, series1, series2 }]
 * When mapping is provided, uses mapped columns; otherwise uses positional defaults.
 * Always applies normalizeValue to x-axis values for consistent type handling.
 *
 * Series keys are collected from the *union* of all rows so sparse data
 * (where some series only appear in later rows) isn't silently dropped.
 * Cell values use `toSeriesNumber` to preserve missing-vs-zero distinction;
 * downstream `connectNulls` controls whether gaps are bridged.
 */
export function transformToLineData(
  data: unknown,
  mapping?: ColumnMapping,
): unknown {
  const records = toRecords(data);
  if (!records.length) return [];
  const keys = collectAllKeys(records);
  if (keys.length < 2) return [];

  const xKey = resolveLabelKey(keys, mapping);
  const seriesKeys = resolveValueKeys(keys, xKey, mapping);

  return records.map((r) => {
    const point: Record<string, unknown> = { x: normalizeValue(r[xKey]) };
    for (const k of seriesKeys) {
      point[k] = toSeriesNumber(r[k]);
    }
    return point;
  });
}

/**
 * Validates raw data shape for line charts.
 * Returns null if valid or empty, error string if rows exist but shape is wrong.
 */
export function validateLineData(
  data: unknown,
  mapping?: ColumnMapping,
): string | null {
  const records = toRecords(data);
  if (!records.length) return null;
  const cols = collectAllKeys(records).length;
  if (cols < 2)
    return `Line chart requires at least 2 columns: first column for x-axis values (dates, numbers, or labels) and one or more columns for numeric series. Your query returned only ${cols} column(s). Example: \`SELECT date, revenue FROM ...\``;
  return validateNumericValueColumns(records, "Line chart", mapping);
}
