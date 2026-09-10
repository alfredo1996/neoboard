/**
 * Pure helpers for the guided query builder (#1696): what a `DatabaseSchema`
 * offers as sources (labels or tables) with their fields, the operator list,
 * and how the picks react to a source change. The connector turns the picks
 * into query text in the app; nothing here knows a dialect.
 */
import type { DatabaseSchema } from "./schema-transforms";

export interface GuidedSource {
  name: string;
  fields: string[];
  /** Each field's type as the schema reports it — the app binds a filter value by it (#1717). */
  types?: Record<string, string>;
}

/** Mirrors `QueryFilterOp` in connector-sdk (component/ must not import it). */
export const GUIDED_FILTER_OPS = [
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "contains",
] as const;
export type GuidedFilterOp = (typeof GUIDED_FILTER_OPS)[number];

export interface GuidedPicks {
  source: string;
  fields: string[];
  /** `field: ""` means no filter; the value is raw text the caller coerces. */
  filter: { field: string; op: GuidedFilterOp; value: string };
  limit: number;
}

export const EMPTY_PICKS: GuidedPicks = {
  source: "",
  fields: [],
  filter: { field: "", op: "=", value: "" },
  limit: 100,
};

function source(
  name: string,
  defs: readonly { name: string; type: string }[],
): GuidedSource {
  // A property-less label arrives with one null-named property (#1714).
  const named = defs.filter((d) => d.name);
  return {
    name,
    fields: named.map((d) => d.name),
    types: Object.fromEntries(named.map((d) => [d.name, d.type])),
  };
}

/** Node labels (with properties) or tables (with columns) — relationship types are not a `MATCH (n:…)` source. */
export function guidedSources(schema?: DatabaseSchema): GuidedSource[] {
  if (!schema) return [];
  if (schema.tables) {
    return schema.tables.map((t) => source(t.name, t.columns));
  }
  return (schema.labels ?? []).map((name) =>
    source(name, schema.nodeProperties?.[name] ?? []),
  );
}

/** Change the source; fields and the filter field belong to the old one, so they go. */
export function withSource(picks: GuidedPicks, source: string): GuidedPicks {
  if (source === picks.source) return picks;
  return {
    ...picks,
    source,
    fields: [],
    filter: { ...picks.filter, field: "" },
  };
}
