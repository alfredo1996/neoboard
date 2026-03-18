/**
 * DatabaseSchema type definition for the app package.
 *
 * Mirrored from connection/src/schema/types.ts because the connection
 * package ships as TypeScript source with internal neo4j-driver-core
 * references that don't resolve under the app's strict tsconfig.
 *
 * This type is used by the schema store, schema hooks, and any app-layer
 * code that handles database schema metadata.
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
  type: "neo4j" | "postgresql";
  labels?: string[];
  relationshipTypes?: string[];
  nodeProperties?: Record<string, PropertyDef[]>;
  relProperties?: Record<string, PropertyDef[]>;
  tables?: TableDef[];
}
