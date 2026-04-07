/**
 * Parameter-select widget data transform.
 */

import { toRecords } from "./shared";

/**
 * Transform to select data: extract first column values as options array.
 */
export function transformToSelectData(data: unknown): unknown {
  const records = toRecords(data);
  if (!records.length) return [];
  const firstKey = Object.keys(records[0])[0];
  if (!firstKey) return [];
  return records
    .map((r) => r[firstKey])
    .filter((v) => v !== null && v !== undefined);
}
