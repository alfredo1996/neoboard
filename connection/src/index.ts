export { DEFAULT_CONNECTION_CONFIG } from "@neoboard/connector-sdk";
export { QueryStatus } from "@neoboard/connector-sdk";
export type { AccessMode } from "@neoboard/connector-sdk";
export { createConnectionModule } from "./connector-registry";

/// Types
export type { AuthConfig } from "@neoboard/connector-sdk";
/// Errors
export { ConnectorError, ConnectorErrorType } from "@neoboard/connector-sdk";
export type {
  ConnectorConstraintKind,
  ConnectorErrorClassification,
} from "@neoboard/connector-sdk";
/// Schema
export type {
  DatabaseSchema,
  TableDef,
  ColumnDef,
  PropertyDef,
} from "@neoboard/connector-sdk";
export { Neo4jSchemaManager } from "./schema/neo4j-schema";
export { PostgresSchemaManager } from "./schema/pg-schema";
/// Connector type constants
export { CONNECTOR_TYPES, CONNECTOR_LABELS } from "./connector-types";
export type { ConnectorType } from "./connector-types";
/// Connector plugin system
export type {
  ConnectorPlugin,
  ConnectorRegistry,
  ConnectorDescriptor,
  ConnectorField,
  ConnectorConfig,
  ConfigValidation,
  SchemaManager,
} from "@neoboard/connector-sdk";
export {
  createConnectorRegistry,
  toDescriptor,
  validateConfig,
} from "@neoboard/connector-sdk";
export {
  connectorRegistry,
  registerConnector,
  unregisterConnector,
  getConnector,
  getAllConnectors,
  getSchemaManager,
  toConnectorError,
} from "./connector-registry";
