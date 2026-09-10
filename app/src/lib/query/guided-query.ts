import { CONNECTOR_QUERY_BUILDERS } from "@neoboard/connection/query-builders";
import type { BuiltQuery, QuerySpec } from "@neoboard/connection";
// Deep import, not the barrel: this module is pure and node-safe, the barrel
// pulls in NVL which touches `document` at module scope.
import type {
  GuidedPicks,
  GuidedSource,
} from "@neoboard/components/lib/guided-query";

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

// Field types a filter value binds as a number: Neo4j's (`Long`, `Double`;
// Cypher 25 says `INTEGER`, `FLOAT`) and PostgreSQL's information_schema names.
const NUMERIC_TYPE =
  /^(long|integer|float|double|smallint|bigint|numeric|real|double precision)$/i;

/**
 * The picker's value is text. Bind it as a number or a boolean only when the
 * schema says the field holds one: a string field holding "1999" or "02139"
 * must get a string, or nothing matches (#1717). A plain decimal only — forms
 * like 1e3 or 0x10 nobody types on purpose stay text — and an integer past
 * 2^53 stays text too, since JS has already rounded it to a different one.
 */
export function coerceFilterValue(
  raw: string,
  type = "",
): number | boolean | string {
  if (NUMERIC_TYPE.test(type) && /^-?\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    return Number.isInteger(n) && !Number.isSafeInteger(n) ? raw : n;
  }
  if (/^boolean$/i.test(type) && (raw === "true" || raw === "false")) {
    return raw === "true";
  }
  return raw;
}

/** `sources` supply the filter field's type; see `coerceFilterValue`. */
export function picksToSpec(
  picks: GuidedPicks,
  sources: readonly GuidedSource[],
): QuerySpec | undefined {
  if (!picks.source) return undefined;
  const { field, op, value } = picks.filter;
  const type = sources.find((s) => s.name === picks.source)?.types?.[field];
  return {
    source: picks.source,
    fields: picks.fields,
    filter: field
      ? {
          field,
          op,
          // A text search, whatever the field holds.
          value: op === "contains" ? value : coerceFilterValue(value, type),
        }
      : undefined,
    limit: picks.limit,
  };
}
