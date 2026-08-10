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
  if (raw === null || raw === undefined) return null;
  // Whitespace-only strings would otherwise coerce to 0 via Number("   "),
  // hiding what is really a missing cell behind a fake zero.
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reject a result whose plotted value columns hold no numbers at all (#1400).
 *
 * A long-format result — `category, series, value`, what `GROUP BY a, b`
 * naturally produces — used to render cleanly and wrongly: `resolveValueKeys`
 * treats every non-label column as a series, so `series` became a series of
 * its own whose cells all coerced to null. That produced duplicated category
 * labels, a ghost legend entry with no bars, and (on line) a single value
 * line zig-zagging across repeated x values. None of it looked like an error.
 *
 * Resolution goes through `resolveValueKeys` — the same call the transform
 * makes — so the validator cannot disagree with what is actually plotted.
 *
 * A column is only rejected when it has at least one non-null cell and *none*
 * of them parse. An entirely null column stays legal: that is a sparse series,
 * what a LEFT JOIN produces, and the reason `collectAllKeys` unions keys.
 */
export function validateNumericValueColumns(
  records: Record<string, unknown>[],
  chartLabel: string,
  mapping?: ColumnMapping,
): string | null {
  if (!records.length) return null;
  const keys = collectAllKeys(records);
  // Fewer than 2 columns is the callers' own column-count error, which says
  // something more useful than this would.
  if (keys.length < 2) return null;

  const labelKey = resolveLabelKey(keys, mapping);
  const offenders = resolveValueKeys(keys, labelKey, mapping).filter((key) => {
    let sawValue = false;
    for (const record of records) {
      const raw = record[key];
      if (raw === null || raw === undefined) continue;
      if (typeof raw === "string" && raw.trim() === "") continue;
      sawValue = true;
      if (toSeriesNumber(raw) !== null) return false;
    }
    return sawValue;
  });

  if (!offenders.length) return null;

  const named = offenders.map((k) => `"${k}"`).join(", ");
  const plural = offenders.length > 1;
  return `${chartLabel} cannot plot ${named} — ${plural ? "those columns contain" : "that column contains"} no numeric values. This usually means the result is in long format (one row per category *and* series, e.g. \`GROUP BY category, status\`), where the series name is its own column. Pivot it so each series is a column, or map the value column explicitly. Example: \`SELECT category, SUM(x) FILTER (WHERE status='delivered') AS delivered, SUM(x) FILTER (WHERE status='shipped') AS shipped FROM ... GROUP BY category\`.`;
}
