/**
 * Mirror of connector-sdk/src/schema/types.ts, kept apart from the transforms.
 *
 * component/ must not import from the SDK or from connection/, so these types
 * are redefined here. Drift is caught by the structural identity test in
 * app/src/lib/connector/__tests__/database-schema-compat.test.ts (#1895), and
 * this file alone is excluded from Sonar's duplication check
 * (sonar.cpd.exclusions) because the copy is the point (#2508).
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

export interface ForeignKeyDef {
  columns: string[];
  refTable: string;
  refColumns: string[];
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  primaryKey?: string[];
  foreignKeys?: ForeignKeyDef[];
}

export interface RelationshipPattern {
  type: string;
  from: string;
  to: string;
}

export interface DatabaseSchema {
  /**
   * Connector type that produced this schema — an open string, as in the SDK
   * (#1119). Nothing in component/ may branch on it: key on the SHAPE below.
   */
  type: string;
  /** Graph shape: node labels */
  labels?: string[];
  /** Graph shape: relationship types */
  relationshipTypes?: string[];
  /** Graph shape: label pairs each relationship type joins */
  relationshipPatterns?: RelationshipPattern[];
  /** Graph shape: per-label property definitions */
  nodeProperties?: Record<string, PropertyDef[]>;
  /** Graph shape: per-relationship-type property definitions */
  relProperties?: Record<string, PropertyDef[]>;
  /** Tabular shape: tables with columns */
  tables?: TableDef[];
}
