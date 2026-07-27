/**
 * @neoboard/connector-sdk — the stable contract for building NeoBoard connectors.
 *
 * Implement {@link ConnectorPlugin} (with {@link ConnectionModule} +
 * {@link AuthenticationModule}) and honor the query-safety helpers to add a new
 * database or service connector. The built-in Neo4j and PostgreSQL connectors
 * in @neoboard/connection are themselves built on this package.
 */

/// Config + core types
export {
  DEFAULT_CONNECTION_CONFIG,
  DEFAULT_AUTHENTICATION_CONFIG,
  QueryStatus,
  AuthType,
} from "./generalized/interfaces";
export type {
  AccessMode,
  AuthConfig,
  ConnectionConfig,
  QueryParams,
  QueryCallback,
  Neo4jAdvancedOptions,
  PostgresAdvancedOptions,
  AdvancedConnectionOptions,
} from "./generalized/interfaces";
export { ConnectionTypes } from "./ConnectionModuleConfig";

/// Base classes a connector extends
export { ConnectionModule } from "./generalized/ConnectionModule";
export { AuthenticationModule } from "./generalized/AuthenticationModule";

/// Errors
export {
  ConnectorError,
  ConnectorErrorType,
  detectNeo4jErrorType,
  detectPostgresErrorType,
  wrapError,
} from "./generalized/ConnectorError";

/// Result records
export { NeodashRecord } from "./generalized/NeodashRecord";
export { NeodashRecordParser } from "./generalized/NeodashRecordParser";

/// Query-safety helpers
export {
  collectUpToLimit,
  drainRetainingUpTo,
} from "./generalized/stream-rows";
export type { CollectedRows } from "./generalized/stream-rows";
export { errorHasMessage, determineQueryStatus } from "./generalized/utils";

/// Schema types + the schema-manager contract (#1119)
export type {
  DatabaseSchema,
  TableDef,
  ColumnDef,
  PropertyDef,
  SchemaManager,
} from "./schema/types";

/// Connector plugin contract + registry factory
export type {
  ConnectorPlugin,
  ConnectorRegistry,
  ConnectorFormField,
} from "./generalized/connector-plugin";
export { createConnectorRegistry } from "./generalized/connector-plugin";

/// Connector type constants
export { CONNECTOR_TYPES, CONNECTOR_LABELS } from "./connector-types";
export type { ConnectorType } from "./connector-types";

/// Query-safety conformance harness (#1122)
export { buildConformanceCases } from "./conformance/query-safety";
export type {
  ConformanceSetup,
  ConformanceQueries,
  ConformanceCase,
} from "./conformance/query-safety";
