export { DEFAULT_CONNECTION_CONFIG } from "./generalized/interfaces";
export { QueryStatus } from "./generalized/interfaces";
export type { AccessMode } from "./generalized/interfaces";
export { createConnectionModule } from "./connector-registry";
export { ConnectionTypes } from "./ConnectionModuleConfig";

/// Types
export type {
  AuthConfig,
  AdvancedConnectionOptions,
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
/// Connector type constants
export {
  CONNECTOR_TYPES,
  CONNECTOR_LABELS,
  CONNECTOR_LANGUAGES,
} from "./connector-types";
export type { ConnectorType } from "./connector-types";
/// Connector plugin system
export type {
  ConnectorPlugin,
  ConnectorRegistry,
  ConnectorFormField,
} from "./generalized/connector-plugin";
export { createConnectorRegistry } from "./generalized/connector-plugin";
export {
  connectorRegistry,
  registerConnector,
  unregisterConnector,
  getConnector,
  getAllConnectors,
} from "./connector-registry";
