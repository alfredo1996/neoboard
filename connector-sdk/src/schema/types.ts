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
  /**
   * Connector type that produced this schema. An open string (not a union)
   * so a registry-supplied connector can describe its own type through the
   * SchemaManager contract (#1119) without editing core SDK types. Built-ins
   * still use "neo4j" / "postgresql".
   */
  type: string;
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
