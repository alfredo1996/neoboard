export { DEFAULT_CONNECTION_CONFIG, DEFAULT_AUTHENTICATION_CONFIG, AuthType } from './generalized/interfaces';
export { Neo4jConnectionModule } from './neo4j/Neo4jConnectionModule';
export { PostgresConnectionModule } from './postgresql/PostgresConnectionModule';
export { QueryStatus } from './generalized/interfaces';
export { createConnectionModule, getConnectionTypeName, getSupportedConnectionTypes } from './adapters/factory';
export { ConnectionTypes } from './ConnectionModuleConfig';

export { ConnectionModule } from './generalized/ConnectionModule';
/// Types
export type { AuthConfig } from './generalized/interfaces';
/// Schema
export type { DatabaseSchema, TableDef, ColumnDef, PropertyDef } from './schema/types';
export { Neo4jSchemaManager } from './schema/neo4j-schema';
export { PostgresSchemaManager } from './schema/pg-schema';
