/**
 * Gauge chart data transform.
 */

import { toRecords, normalizeValue } from "./shared";

/**
 * Transform to gauge chart format: [{ value, name }]
 * Extracts the first row. If two columns exist, first = value, second = name.
 */
export function transformToGaugeData(data: unknown): unknown {
  const records = toRecords(data);
  if (!records.length) return [];
  const first = records[0];
  const keys = Object.keys(first);
  if (!keys.length) return [];

  // Look for explicit "value"/"name" keys, then fall back to positional
  const valueKey = keys.find((k) => /^value$/i.test(k)) ?? keys[0];
  const nameKey =
    keys.find((k) => /^(name|label|title)$/i.test(k) && k !== valueKey) ??
    keys[1];

  return [
    {
      value: Number(first[valueKey]) || 0,
      name: nameKey ? String(normalizeValue(first[nameKey]) ?? "") : "",
    },
  ];
}
