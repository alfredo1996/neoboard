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

  /**
   * Form field definitions for auto-generated connection forms.
   * When present, the UI can render a connection form without
   * hard-coding fields for each connector type.
   */
  formFields?: ConnectorFormField[];
}

/**
 * Describes a single field in a connector's connection form.
 */
export interface ConnectorFormField {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "select" | "boolean";
  required?: boolean;
  placeholder?: string;
  default?: unknown;
  options?: { label: string; value: string }[];
  description?: string;
}

/**
 * Connector registry — stores and retrieves registered connector plugins.
 */
export interface ConnectorRegistry {
  register(plugin: ConnectorPlugin): void;
  unregister(type: string): void;
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

      // Validate formFields if provided
      if (plugin.formFields) {
        const keys = new Set<string>();
        for (const field of plugin.formFields) {
          if (!field.key || !field.label || !field.type) {
            console.warn(
              'Connector "' +
                plugin.type +
                '": formField missing key/label/type:',
              field,
            );
            continue; // Skip duplicate check for invalid fields
          }
          if (keys.has(field.key)) {
            console.warn(
              'Connector "' +
                plugin.type +
                '": duplicate formField key "' +
                field.key +
                '"',
            );
          }
          keys.add(field.key);
          if (
            field.type === "select" &&
            (!field.options || field.options.length === 0)
          ) {
            console.warn(
              'Connector "' +
                plugin.type +
                '": select field "' +
                field.key +
                '" has no options',
            );
          }
        }
      }

      // Validate category if provided
      const validCategories = ["database", "graph", "api", "file"];
      if (plugin.category && !validCategories.includes(plugin.category)) {
        console.warn(
          'Connector "' +
            plugin.type +
            '": invalid category "' +
            plugin.category +
            '". Expected: ' +
            validCategories.join(", "),
        );
      }

      plugins.set(plugin.type, plugin);
    },
    unregister(type) {
      plugins.delete(type);
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
