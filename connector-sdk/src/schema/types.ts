/**
 * Shared normalized schema types for all connector types.
 */

import type { AuthConfig } from "../generalized/interfaces";

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

/**
 * Introspects a connector's schema. A connector plugin supplies its own
 * implementation via {@link ConnectorPlugin.createSchemaManager}; the
 * registry resolves it by connector type (#1119) — no hardcoded dispatch.
 */
export interface SchemaManager {
  fetchSchema(authConfig: AuthConfig): Promise<DatabaseSchema>;
}
