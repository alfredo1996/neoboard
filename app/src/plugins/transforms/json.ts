/**
 * JSON viewer data transform.
 */

import { toRecords } from "./shared";

/**
 * Pass data through for JSON viewer.
 * Uses toRecords as a safety net to ensure the viewer always
 * receives the records array, not a metadata wrapper.
 */
export function transformToJsonData(data: unknown): unknown {
  const records = toRecords(data);
  return records.length > 0 ? records : data;
}
