import { READ, WRITE } from 'neo4j-driver-core/lib/driver.js';
import { ConnectionTypes } from '../ConnectionModuleConfig';

/**
 * Types of supported authentication methods.
 */
export enum AuthType {
  /** Native authentication using username and password. */
  NATIVE = 1,

  /** Single Sign-On authentication. */
  SINGLE_SIGN_ON = 2,

  /** No authentication provided. */
  EMPTY = 3,
}

/**
 * Configuration object for authenticating with a Neo4j database.
 */
export interface AuthConfig {
  /**
   * Username used for authentication.
   */
  username: string;

  /**
   * Password used for authentication.
   */
  password: string;

  /**
   * Type of authentication to use (e.g., native, single sign-on).
   */
  authType: AuthType;

  /**
   * URI of the Neo4j instance (e.g., 'bolt://localhost:7687').
   */
  uri: string;
}

/**
 * Default empty authentication configuration.
 *
 * Useful when no credentials are provided or authentication is intentionally disabled.
 */
export const DEFAULT_AUTHENTICATION_CONFIG: AuthConfig = {
  username: '',
  password: '',
  authType: AuthType.EMPTY,
  uri: '',
};

/**
 * Default configuration settings for establishing a Neo4j connection.
 *
 * Includes standard values for timeout, access mode, and result limits.
 * Suitable for most non-critical read/write use cases.
 */
export const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  /**
   * Timeout (ms) for establishing the initial connection.
   */
  connectionTimeout: 30 * 1000,

  /**
   * Name of the target database.
   */
  database: undefined,

  /**
   * Default access mode: READ.
   */
  accessMode: READ,

  /**
   * Timeout (ms) for Cypher query execution.
   */
  timeout: 2 * 1000,

  /**
   * Maximum number of records to return before truncating.
   */
  rowLimit: 5000,

  /**
   * Type of connection being used.
   */
  connectionType: ConnectionTypes.NEO4J,

  /**
   * Flag indicating whether to parse results to NeodashRecord format.
   */
  parseToNeodashRecord: true,

  /**
   * If true, the system will use node/relationship/path properties as fields instead of top-level keys.
   * Default is false.
   */
  useNodePropsAsFields: false,
};

/**
 * Defines the configuration options for connecting to a Neo4j database instance.
 */
export interface ConnectionConfig {
  /**
   * The access mode for the connection: READ or WRITE.
   */
  accessMode: READ | WRITE;

  /**
   * Timeout in milliseconds for query execution.
   */
  timeout: number;

  /**
   * Timeout in milliseconds for establishing a connection.
   */
  connectionTimeout: number;

  /**
   * The name of the target Neo4j database. If undefined, the driver will use the default database.
   */
  database?: string;

  /**
   * The maximum number of records to return from a query before truncation is applied.
   */
  rowLimit: number;

  /**
   * A string representing the type of connection (e.g., 'neo4j', 'bolt').
   */
  connectionType: ConnectionTypes;

  /**
   * If true, the connection module will invoke its parsing module to parse the result to a NeodashRecord.
   */
  parseToNeodashRecord: boolean;

  /**
   * If true, the system will use node/relationship/path properties as fields instead of top-level keys.
   * Default is false.
   */
  useNodePropsAsFields: boolean;
}

/**
 * Enum representing the current status of a Cypher query execution.
 * Used to handle state changes and UI behavior in response to query outcomes.
 */
export enum QueryStatus {
  /**
   * No query was provided for the report.
   */
  NO_QUERY,

  /**
   * The query returned no data and there is nothing to display.
   */
  NO_DATA,

  /**
   * The query returned data, but none of it can be visualized (e.g. unsupported format).
   */
  NO_DRAWABLE_DATA,

  /**
   * The report is currently waiting for external or custom logic to execute before running the query.
   */
  WAITING,

  /**
   * The query is currently running.
   */
  RUNNING,

  /**
   * The query exceeded the configured execution timeout.
   */
  TIMED_OUT,

  /**
   * The query completed successfully and returned data that can be fully visualized.
   */
  COMPLETE,

  /**
   * The query completed and returned data, but the result was truncated due to exceeding the row limit.
   */
  COMPLETE_TRUNCATED,

  /**
   * The query failed, likely due to a Cypher syntax error, database issue, or connectivity problem.
   */
  ERROR,
}

/**
 * Interface defining the callback methods for handling the result of a Cypher query.
 */
export interface QueryCallback<T> {
  onSuccess?: (result: T) => void;
  onFail?: (error: any) => void;
  setStatus?: (status: QueryStatus) => void;
  setFields?: (fields: any) => void;
  setSchema?: (schema: any) => void;
}

/**
 * Interface to define Cypher queries and their parameters.
 */
export interface QueryParams {
  query: string; // The Cypher query to be executed.
  params?: Record<string, any>; // Optional parameters for the Cypher query.
}

// Re-export ConnectionTypes for convenience
export { ConnectionTypes } from '../ConnectionModuleConfig';
