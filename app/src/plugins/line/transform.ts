/**
 * Line chart data transform and validator.
 */

import {
  toRecords,
  resolveLabelKey,
  resolveValueKeys,
  normalizeValue,
  type ColumnMapping,
} from "../transforms/shared-utils";

/**
 * Transform to line chart format: [{ x, series1, series2 }]
 * When mapping is provided, uses mapped columns; otherwise uses positional defaults.
 * Always applies normalizeValue to x-axis values for consistent type handling.
 */
export function transformToLineData(
  data: unknown,
  mapping?: ColumnMapping,
): unknown {
  const records = toRecords(data);
  if (!records.length) return [];
  const keys = Object.keys(records[0]);
  if (keys.length < 2) return [];

  const xKey = resolveLabelKey(keys, mapping);
  const seriesKeys = resolveValueKeys(keys, xKey, mapping);

  return records.map((r) => {
    const point: Record<string, unknown> = { x: normalizeValue(r[xKey]) };
    for (const k of seriesKeys) {
      point[k] = Number(r[k]) || 0;
    }
    return point;
  });
}

/**
 * Validates raw data shape for line charts.
 * Returns null if valid or empty, error string if rows exist but shape is wrong.
 */
export function validateLineData(data: unknown): string | null {
  const records = toRecords(data);
  if (!records.length) return null;
  const cols = Object.keys(records[0]).length;
  if (cols < 2)
    return `Line chart requires at least 2 columns: first column for x-axis values (dates, numbers, or labels) and one or more columns for numeric series. Your query returned only ${cols} column(s). Example: \`SELECT date, revenue FROM ...\``;
  return null;
}
