/**
 * Connector plugin contract.
 *
 * A connector is a {@link ConnectorDescriptor} — pure data saying what it is
 * and which config it needs — plus the factories that need a database driver.
 * Implement this and list the package in `neoboard-connectors.json` to make a
 * new connector available throughout the app.
 *
 * Example (adding MySQL):
 *
 *   const mysqlPlugin: ConnectorPlugin = {
 *     type: "mysql",
 *     label: "MySQL",
 *     category: "database",
 *     queryLanguage: "sql",
 *     supportsWrite: true,
 *     fields: [
 *       { key: "uri", label: "URI", type: "uri", group: "connection",
 *         required: true, protocols: ["mysql:"] },
 *       { key: "password", label: "Password", type: "password",
 *         group: "connection", required: true },
 *     ],
 *     createModule(config) { return new MysqlConnectionModule(config); },
 *   };
 */

import type { ConnectionModule } from "./ConnectionModule";
import {
  MAX_ICON_SVG_BYTES,
  type ConnectorConfig,
  type ConnectorDescriptor,
  type ConnectorField,
} from "./descriptor";
import type { SchemaManager } from "../schema/types";

/**
 * Connector plugin — the contract a connector must satisfy.
 */
export type ConnectorPlugin = ConnectorDescriptor & {
  /**
   * Factory: create a ConnectionModule from ONE config bag — the values of the
   * descriptor's `fields`, keyed by `field.key` (see {@link ConnectorConfig}).
   * The connector builds its own driver auth, reads its own option keys and
   * applies `database` itself. This is the only method that touches the actual
   * database driver.
   */
  createModule(config: ConnectorConfig): ConnectionModule;

  /**
   * Factory: create a SchemaManager for introspecting this connector's
   * schema. Optional — connectors without schema introspection omit it, and
   * the registry resolves them to `undefined`. Resolved by connector type
   * via the registry (#1119), replacing hardcoded per-type dispatch.
   */
  createSchemaManager?(): SchemaManager;
};

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

const CATEGORIES = new Set(["database", "graph", "api", "file"]);
const FIELD_TYPES = new Set([
  "text",
  "password",
  "number",
  "select",
  "boolean",
  "uri",
]);
const FIELD_GROUPS = new Set(["connection", "advanced"]);

/** One way a descriptor can be malformed, and what to tell its author. */
interface Rule<T> {
  broken: (subject: T, seenKeys: ReadonlySet<string>) => boolean;
  problem: (subject: T) => string;
}

const DESCRIPTOR_RULES: Rule<ConnectorPlugin>[] = [
  {
    broken: (plugin) => !CATEGORIES.has(plugin.category),
    problem: (plugin) =>
      `invalid category "${plugin.category}". Expected: ${[...CATEGORIES].join(", ")}`,
  },
  {
    broken: (plugin) =>
      plugin.iconSvg !== undefined &&
      new TextEncoder().encode(plugin.iconSvg).length > MAX_ICON_SVG_BYTES,
    problem: () => `iconSvg is larger than ${MAX_ICON_SVG_BYTES} bytes`,
  },
  {
    broken: (plugin) => !Array.isArray(plugin.fields),
    problem: () =>
      "fields must be an array (use [] for a connector with no config)",
  },
];

/** Checked in this order, per field; the first that matches names the problem. */
const FIELD_RULES: Rule<ConnectorField>[] = [
  {
    broken: (field) => !field.key || !field.label || !field.type,
    problem: () => "a field is missing key, label or type",
  },
  {
    broken: (field) => !FIELD_TYPES.has(field.type),
    problem: (field) => `field "${field.key}" has unknown type "${field.type}"`,
  },
  {
    broken: (field) => !FIELD_GROUPS.has(field.group),
    problem: (field) =>
      `field "${field.key}" has invalid group "${field.group}"`,
  },
  {
    broken: (field, seenKeys) => seenKeys.has(field.key),
    problem: (field) => `duplicate field key "${field.key}"`,
  },
  {
    broken: (field) => field.type === "select" && !field.options?.length,
    problem: (field) => `select field "${field.key}" has no options`,
  },
  {
    broken: (field) => field.type === "uri" && !field.protocols?.length,
    problem: (field) => `uri field "${field.key}" declares no protocols`,
  },
];

const NO_KEYS: ReadonlySet<string> = new Set();

function firstProblem<T>(
  rules: Rule<T>[],
  subject: T,
  seenKeys: ReadonlySet<string> = NO_KEYS,
): string | undefined {
  return rules.find((rule) => rule.broken(subject, seenKeys))?.problem(subject);
}

function firstFieldProblem(fields: ConnectorField[]): string | undefined {
  const seenKeys = new Set<string>();
  for (const field of fields) {
    const problem = firstProblem(FIELD_RULES, field, seenKeys);
    if (problem) return problem;
    seenKeys.add(field.key);
  }
  return undefined;
}

/**
 * Throws on a malformed descriptor. These were warnings until #1897, which
 * meant a typo registered fine and surfaced later as a broken connection form.
 * A connector is compiled into the server, so throwing here fails startup —
 * where its author is looking.
 */
function assertValidDescriptor(plugin: ConnectorPlugin): void {
  const problem =
    firstProblem(DESCRIPTOR_RULES, plugin) ?? firstFieldProblem(plugin.fields);
  if (problem) throw new Error(`Connector "${plugin.type}": ${problem}`);
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

      assertValidDescriptor(plugin);

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
