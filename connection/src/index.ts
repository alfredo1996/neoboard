export { DEFAULT_CONNECTION_CONFIG } from "@neoboard/connector-sdk";
export { QueryStatus } from "@neoboard/connector-sdk";
export type { AccessMode } from "@neoboard/connector-sdk";
export { createConnectionModule } from "./connector-registry";
export { ConnectionTypes } from "@neoboard/connector-sdk";

/// Types
export type {
  AuthConfig,
  AdvancedConnectionOptions,
  Neo4jAdvancedOptions,
  PostgresAdvancedOptions,
} from "@neoboard/connector-sdk";
/// Errors
export { ConnectorError, ConnectorErrorType } from "@neoboard/connector-sdk";
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
export {
  CONNECTOR_TYPES,
  CONNECTOR_LABELS,
  CONNECTOR_LANGUAGES,
} from "./connector-types";
export type { ConnectorType } from "./connector-types";
/// Built-in connector form fields (client-safe — no drivers)
export {
  CONNECTOR_FORM_FIELDS,
  neo4jFormFields,
  postgresFormFields,
} from "./form-fields";
/// Built-in connector query languages (client-safe — no drivers)
export { CONNECTOR_QUERY_LANGUAGES } from "./query-languages";
/// Connector plugin system
export type {
  ConnectorPlugin,
  ConnectorRegistry,
  ConnectorFormField,
  SchemaManager,
} from "@neoboard/connector-sdk";
export { createConnectorRegistry } from "@neoboard/connector-sdk";
export {
  connectorRegistry,
  registerConnector,
  unregisterConnector,
  getConnector,
  getAllConnectors,
  getSchemaManager,
} from "./connector-registry";
