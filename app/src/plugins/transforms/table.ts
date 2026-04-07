/**
 * Table (DataGrid) data transform.
 */

import { toRecords } from "./shared";

/**
 * Transform to flat array of records for DataGrid.
 */
export function transformToTableData(data: unknown): unknown {
  return toRecords(data);
}
