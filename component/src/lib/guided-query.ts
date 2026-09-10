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

/** Node labels (with properties) or tables (with columns) — relationship types are not a `MATCH (n:…)` source. */
export function guidedSources(schema?: DatabaseSchema): GuidedSource[] {
  if (!schema) return [];
  if (schema.tables) {
    return schema.tables.map((t) => ({
      name: t.name,
      fields: t.columns.map((c) => c.name),
    }));
  }
  return (schema.labels ?? []).map((name) => ({
    name,
    // A property-less label arrives with one null-named property (#1714).
    fields: (schema.nodeProperties?.[name] ?? [])
      .map((p) => p.name)
      .filter(Boolean),
  }));
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
