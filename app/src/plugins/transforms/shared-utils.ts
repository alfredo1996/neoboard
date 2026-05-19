/**
 * Shared transform utilities for chart plugins.
 *
 * Extracted from the legacy chart-registry so each plugin can import
 * only what it needs, without coupling to a monolithic registry.
 */

import { normalizeValue } from "@/lib/shared/normalize-value";
import type { ColumnMapping } from "@neoboard/components";

export type { ColumnMapping };
export { normalizeValue };

/**
 * Normalize query results to a flat array of record objects.
 * Handles both Neo4j (array) and PostgreSQL ({ records }) formats.
 */
export function toRecords(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "records" in data) {
    return (data as { records: Record<string, unknown>[] }).records;
  }
  return [];
}

/**
 * Resolve the label/x-axis key from a mapping, falling back to the first column.
 */
export function resolveLabelKey(
  keys: string[],
  mapping?: ColumnMapping,
): string {
  if (mapping?.xAxis && keys.includes(mapping.xAxis)) return mapping.xAxis;
  return keys[0];
}

/**
 * Resolve value/series keys from a mapping, falling back to all non-label columns.
 */
export function resolveValueKeys(
  keys: string[],
  labelKey: string,
  mapping?: ColumnMapping,
): string[] {
  if (mapping?.yAxis && mapping.yAxis.length > 0) {
    const valid = mapping.yAxis.filter((k) => keys.includes(k));
    if (valid.length > 0) return valid;
  }
  return keys.filter((k) => k !== labelKey);
}

/**
 * Collect the union of keys across every record. Using only `Object.keys(records[0])`
 * silently drops series that happen to be absent from the first row (sparse data).
 */
export function collectAllKeys(records: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const r of records) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        ordered.push(k);
      }
    }
  }
  return ordered;
}

/**
 * Coerce a raw cell value to a numeric series value, preserving the
 * distinction between "missing" (null) and an actual zero. Returns `null`
 * for null/undefined inputs and for values that can't be parsed as a finite
 * number; ECharts renders nulls as gaps rather than masquerading them as 0.
 */
export function toSeriesNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}
