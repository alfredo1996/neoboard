export { DEFAULT_CONNECTION_CONFIG } from "./generalized/interfaces";
export type { AccessMode } from "./generalized/interfaces";
export { createConnectionModule } from "./adapters/factory";
export { ConnectionTypes } from "./ConnectionModuleConfig";

/// Types
export type {
  AuthConfig,
  AdvancedConnectionOptions,
  BaseAdvancedOptions,
  Neo4jAdvancedOptions,
  PostgresAdvancedOptions,
} from "./generalized/interfaces";
/// Errors
export {
  ConnectorError,
  ConnectorErrorType,
} from "./generalized/ConnectorError";
/// Schema
export type {
  DatabaseSchema,
  TableDef,
  ColumnDef,
  PropertyDef,
} from "./schema/types";
export { Neo4jSchemaManager } from "./schema/neo4j-schema";
export { PostgresSchemaManager } from "./schema/pg-schema";
