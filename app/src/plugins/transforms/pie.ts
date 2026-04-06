/**
 * Pie chart data transform and validator.
 */

import {
  toRecords,
  resolveLabelKey,
  normalizeValue,
  type ColumnMapping,
} from "./shared";

/**
 * Transform to pie chart format: [{ name, value }]
 * When mapping is provided, uses mapped columns; otherwise uses positional defaults.
 * Always applies normalizeValue to names for consistent type handling.
 */
export function transformToPieData(
  data: unknown,
  mapping?: ColumnMapping,
): unknown {
  const records = toRecords(data);
  if (!records.length) return [];
  const keys = Object.keys(records[0]);
  if (keys.length < 2) return [];

  const nameKey = resolveLabelKey(keys, mapping);
  const valueKey =
    mapping?.yAxis?.[0] && keys.includes(mapping.yAxis[0])
      ? mapping.yAxis[0]
      : (keys.find((k) => k !== nameKey) ?? keys[1]);

  return records.map((r) => ({
    name: String(normalizeValue(r[nameKey]) ?? ""),
    value: Number(r[valueKey]) || 0,
  }));
}

/**
 * Validates raw data shape for pie charts.
 * Returns null if valid or empty, error string if rows exist but shape is wrong.
 */
export function validatePieData(data: unknown): string | null {
  const records = toRecords(data);
  if (!records.length) return null;
  const cols = Object.keys(records[0]).length;
  if (cols < 2)
    return `Pie chart requires at least 2 columns: first column for slice names and second column for numeric values. Your query returned only ${cols} column(s). Example: \`SELECT category, total FROM ...\``;
  return null;
}
