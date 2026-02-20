/**
 * Shared normalized schema types for all connector types.
 */

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
  type: 'neo4j' | 'postgresql';
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
