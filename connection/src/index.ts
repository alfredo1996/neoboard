export { DEFAULT_CONNECTION_CONFIG } from './generalized/interfaces';
export { createConnectionModule } from './adapters/factory';
export { ConnectionTypes } from './ConnectionModuleConfig';

/// Types
export type { AuthConfig } from './generalized/interfaces';
/// Schema
export type { DatabaseSchema, TableDef, ColumnDef, PropertyDef } from './schema/types';
export { Neo4jSchemaManager } from './schema/neo4j-schema';
export { PostgresSchemaManager } from './schema/pg-schema';
