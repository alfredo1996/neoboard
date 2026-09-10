import { CONNECTOR_QUERY_BUILDERS } from "@neoboard/connection/query-builders";
import type { BuiltQuery, QuerySpec } from "@neoboard/connection";
// Deep import, not the barrel: this module is pure and node-safe, the barrel
// pulls in NVL which touches `document` at module scope.
import type { GuidedPicks } from "@neoboard/components/lib/guided-query";

/**
 * The guided builder's pure half in the app (#1696): which connector builds
 * the text, which charts get the builder, and how the picker's raw picks
 * become a `QuerySpec`.
 */

/** The connector's own `buildQuery`; undefined when it has none, so the UI hides the builder. */
export function queryBuilderFor(
  type?: string,
): ((spec: QuerySpec) => BuiltQuery) | undefined {
  return type && Object.hasOwn(CONNECTOR_QUERY_BUILDERS, type)
    ? CONNECTOR_QUERY_BUILDERS[type]
    : undefined;
}

/** Tabular charts a non-technical user builds from picks; graph, map, json and form stay expert. */
export const GUIDED_CHART_TYPES: ReadonlySet<string> = new Set([
  "bar",
  "line",
  "pie",
  "table",
  "single-value",
]);

/**
 * The picker's value is text; bind a plain decimal as a number and
 * true/false as booleans so `released > 2000` compares numerically. Anything
 * else (including forms like 1e3 or 0x10 nobody types on purpose) stays text.
 */
export function coerceFilterValue(raw: string): number | boolean | string {
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
}

export function picksToSpec(picks: GuidedPicks): QuerySpec | undefined {
  if (!picks.source) return undefined;
  return {
    source: picks.source,
    fields: picks.fields,
    filter: picks.filter.field
      ? {
          field: picks.filter.field,
          op: picks.filter.op,
          value: coerceFilterValue(picks.filter.value),
        }
      : undefined,
    limit: picks.limit,
  };
}
