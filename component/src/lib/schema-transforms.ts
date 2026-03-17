/**
 * Schema transform utilities for the query editor completion system.
 *
 * These are pure functions that convert `DatabaseSchema` (from the connection
 * package) into the formats expected by the CM6 completion libraries.
 *
 * The types are redefined here (mirroring connection/src/schema/types.ts) to
 * respect the package boundary: component/ must not import from connection/.
 */

// ---------------------------------------------------------------------------
// Mirrored types (kept in sync with connection/src/schema/types.ts)
// ---------------------------------------------------------------------------

export interface PropertyDef {
  name: string;
  type: string;
}

export interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
}

export interface DatabaseSchema {
  type: "neo4j" | "postgresql";
  /** Neo4j: node labels */
  labels?: string[];
  /** Neo4j: relationship types */
  relationshipTypes?: string[];
  /** Neo4j: per-label property definitions */
  nodeProperties?: Record<string, PropertyDef[]>;
  /** Neo4j: per-relationship-type property definitions */
  relProperties?: Record<string, PropertyDef[]>;
  /** PostgreSQL: tables with columns */
  tables?: TableDef[];
}

// ---------------------------------------------------------------------------
// EditorSupportSchema — format expected by @neo4j-cypher/editor-support
// ---------------------------------------------------------------------------

export interface EditorSupportSchema {
  labels: string[];
  relationshipTypes: string[];
  /** Flat deduplicated list of all property keys across all node + rel types */
  propertyKeys: string[];
}

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

/**
 * Converts a PostgreSQL `DatabaseSchema` into the `SQLNamespace` format
 * expected by `@codemirror/lang-sql`'s `sql({ schema })` option.
 *
 * Result: `{ tableName: ['col1', 'col2', ...], ... }`
 */
export function toSqlSchema(schema: DatabaseSchema): Record<string, string[]> {
  if (!schema.tables?.length) return {};
  const result: Record<string, string[]> = {};
  for (const table of schema.tables) {
    result[table.name] = table.columns.map((c) => c.name);
  }
  return result;
}

/**
 * Converts a Neo4j `DatabaseSchema` into the `EditorSupportSchema` format
 * expected by `@neo4j-cypher/codemirror`'s `setSchema()`.
 *
 * Property keys are flattened from all node + relationship property maps and
 * deduplicated (the Neo4j library uses a flat list, not per-label maps).
 */
export function toCypherSchema(schema: DatabaseSchema): EditorSupportSchema {
  // Filter null/undefined entries — the neo4j editor-support package
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
