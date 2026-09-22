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
// Each connector's schema manager is reached through `getSchemaManager(type)`,
// not exported by name: a connector-named export is one more thing that
// changes when a connector is added (#1905).
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
/// Row value contract (#1904) — the shapes the app is allowed to key on
export {
  isGraphNode,
  isGraphRelationship,
  isGraphPath,
} from "@neoboard/connector-sdk";
export type {
  Row,
  RowValue,
  GraphNode,
  GraphRelationship,
  GraphPath,
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
