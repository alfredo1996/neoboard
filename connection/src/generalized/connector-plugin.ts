/**
 * Connector plugin contract.
 *
 * Defines everything NeoBoard needs to support a new database or service
 * type. Implement this interface and call `registerConnector()` to make
 * a new connector available throughout the app.
 *
 * Example (adding MySQL):
 *
 *   const mysqlPlugin: ConnectorPlugin = {
 *     type: "mysql",
 *     label: "MySQL",
 *     category: "database",
 *     queryLanguage: "sql",
 *     supportsWrite: true,
 *     createModule(auth, opts) { return new MysqlConnectionModule(auth, opts); },
 *   };
 *   registerConnector(mysqlPlugin);
 */

import type { ConnectionModule } from "./ConnectionModule";
import type { AuthConfig } from "./interfaces";

/**
 * Connector plugin — the contract a connector must satisfy.
 */
export interface ConnectorPlugin {
  /** Unique string identifier. Used in DB, URLs, and API payloads. */
  type: string;

  /** Human-readable display name shown in the connection type picker. */
  label: string;

  /** Category for grouping in the UI. */
  category: "database" | "graph" | "api" | "file";

  /**
   * Factory: create a ConnectionModule instance from auth config.
   * This is the only method that imports the actual database driver.
   */
  createModule(
    authConfig: AuthConfig,
    advancedOptions?: Record<string, unknown>,
  ): ConnectionModule;

  /** Does this connector produce graph data (nodes/edges)? */
  supportsGraphData?: boolean;

  /** Does this connector support write operations? */
  supportsWrite?: boolean;

  /**
   * Query language identifier for the CodeMirror editor.
   * Built-in: "cypher", "sql". Determines syntax highlighting.
   */
  queryLanguage?: string;

  /**
   * URI protocols this connector accepts (for validation).
   * e.g. ["bolt:", "neo4j:"] or ["postgresql:"]
   */
  allowedProtocols?: string[];

  /** Default URI placeholder shown in the connection form. */
  uriPlaceholder?: string;

  /** Default database name placeholder. */
  databasePlaceholder?: string;
}

/**
 * Connector registry — stores and retrieves registered connector plugins.
 */
export interface ConnectorRegistry {
  register(plugin: ConnectorPlugin): void;
  get(type: string): ConnectorPlugin | undefined;
  has(type: string): boolean;
  getAll(): ConnectorPlugin[];
  getTypes(): string[];
}

/**
 * Create a new connector registry instance.
 */
export function createConnectorRegistry(): ConnectorRegistry {
  const plugins = new Map<string, ConnectorPlugin>();

  return {
    register(plugin) {
      if (!plugin.type || plugin.type.trim() === "") {
        throw new Error("Connector plugin: type is required");
      }
      if (!plugin.label || plugin.label.trim() === "") {
        throw new Error("Connector plugin: label is required");
      }
      if (typeof plugin.createModule !== "function") {
        throw new Error("Connector plugin: createModule must be a function");
      }
      if (plugins.has(plugin.type)) {
        throw new Error(
          `Connector "${plugin.type}" is already registered. ` +
            `Call unregister first if you want to replace it.`,
        );
      }
      plugins.set(plugin.type, plugin);
    },
    get(type) {
      return plugins.get(type);
    },
    has(type) {
      return plugins.has(type);
    },
    getAll() {
      return Array.from(plugins.values());
    },
    getTypes() {
      return Array.from(plugins.keys());
    },
  };
}
