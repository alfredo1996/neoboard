/**
 * Schema transform utilities for the query editor completion system.
 *
 * These are pure functions that convert `DatabaseSchema` (from the connector
 * SDK) into the formats expected by the CM6 completion libraries.
 *
 * The input types mirror connector-sdk/src/schema/types.ts in
 * ./schema-types.ts, which explains why the mirror exists.
 */

import type { DatabaseSchema } from "./schema-types";

export type {
  PropertyDef,
  ColumnDef,
  ForeignKeyDef,
  TableDef,
  RelationshipPattern,
  DatabaseSchema,
} from "./schema-types";

// ---------------------------------------------------------------------------
// CypherDbSchema — format compatible with @neo4j-cypher/react-codemirror's
// cypher() function (DbSchema type). This is a subset of the full DbSchema
// containing only the fields we populate from our schema API.
// ---------------------------------------------------------------------------

export interface CypherDbSchema {
  labels?: string[];
  relationshipTypes?: string[];
  /** Flat deduplicated list of all property keys across all node + rel types */
  propertyKeys?: string[];
}

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

/**
 * Converts a tabular `DatabaseSchema` into the `SQLNamespace` format
 * expected by `@codemirror/lang-sql`'s `sql({ schema })` option.
 *
 * Result: `{ tableName: ['col1', 'col2', ...], ... }`
 */
export function toSqlSchema(schema: DatabaseSchema): Record<string, string[]> {
  // Use a null-prototype object to prevent prototype pollution for table names
  // like "__proto__" or "constructor" that could taint the prototype chain.
  const result = Object.create(null) as Record<string, string[]>;
  if (!schema.tables?.length) return result;
  for (const table of schema.tables) {
    result[table.name] = table.columns.map((c) => c.name);
  }
  return result;
}

/**
 * Converts a graph-shaped `DatabaseSchema` into the `CypherDbSchema` format
 * compatible with `@neo4j-cypher/react-codemirror`'s `cypher()` function.
 *
 * Property keys are flattened from all node + relationship property maps and
 * deduplicated (the library uses a flat list, not per-label maps).
 */
export function toCypherDbSchema(schema: DatabaseSchema): CypherDbSchema {
  // Filter null/undefined entries — the Cypher editor-support package
  // calls ecsapeCypher() on each value and it crashes on null.
  const labels = (schema.labels ?? []).filter(Boolean) as string[];
  const relationshipTypes = (schema.relationshipTypes ?? []).filter(
    Boolean,
  ) as string[];

  const propertyKeySet = new Set<string>();
  for (const props of Object.values(schema.nodeProperties ?? {})) {
    for (const p of props) {
      if (p.name) propertyKeySet.add(p.name);
    }
  }
  for (const props of Object.values(schema.relProperties ?? {})) {
    for (const p of props) {
      if (p.name) propertyKeySet.add(p.name);
    }
  }

  return {
    labels,
    relationshipTypes,
    propertyKeys: Array.from(propertyKeySet),
  };
}
