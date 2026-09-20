/**
 * Global connector registry — singleton that auto-registers built-in
 * connectors (Neo4j, PostgreSQL) on first import.
 *
 * To add a new connector:
 *   1. Create a plugin file implementing ConnectorPlugin
 *   2. Import and register it here
 *
 * External/community connectors can call registerConnector() from
 * their own package after importing this module.
 */

import {
  createConnectorRegistry,
  wrapError,
  type ConnectorConfig,
  type ConnectorError,
  type ConnectorPlugin,
  type ConnectorRegistry,
  type SchemaManager,
} from "@neoboard/connector-sdk";
import { neo4jPlugin } from "./neo4j/plugin";
import { postgresPlugin } from "./postgresql/plugin";
import { EXTERNAL_CONNECTORS } from "./external-connectors.generated";

const registry: ConnectorRegistry = createConnectorRegistry();

// Register built-in connectors
registry.register(neo4jPlugin);
registry.register(postgresPlugin);

// ── External connectors (from neoboard-connectors.json) ─────────────────
// Registered AFTER built-ins. Same-type duplicates without overrides throw
// loudly so operators spot the conflict at startup.
for (const { plugin, overrides } of EXTERNAL_CONNECTORS) {
  if (registry.has(plugin.type)) {
    if (!overrides) {
      const existing = registry.get(plugin.type);
      const source =
        existing === neo4jPlugin || existing === postgresPlugin
          ? "built-in"
          : "previously-registered external";
      throw new Error(
        'External connector "' +
          plugin.type +
          '" conflicts with a ' +
          source +
          " connector. " +
          'Set "overrides": true in neoboard-connectors.json to replace it.',
      );
    }
    registry.unregister(plugin.type);
  }
  registry.register(plugin);
}

// Re-export for external use
export { registry as connectorRegistry };
export type { ConnectorPlugin, ConnectorRegistry };
export { createConnectorRegistry } from "@neoboard/connector-sdk";

/**
 * Convenience: register a new connector plugin.
 */
export function registerConnector(plugin: ConnectorPlugin): void {
  registry.register(plugin);
}

/**
 * Convenience: unregister a connector plugin by type.
 */
export function unregisterConnector(type: string): void {
  registry.unregister(type);
}

/**
 * Convenience: get a connector plugin by type.
 */
export function getConnector(type: string): ConnectorPlugin | undefined {
  return registry.get(type);
}

/**
 * Convenience: get all registered connector plugins.
 */
export function getAllConnectors(): ConnectorPlugin[] {
  return registry.getAll();
}

/**
 * Resolve a connector's schema manager by type (#1119). Replaces the old
 * hardcoded `'neo4j' | 'postgresql'` dispatch — any registry-supplied
 * connector that declares `createSchemaManager()` gets one. Returns
 * `undefined` for unknown types or connectors without schema introspection.
 */
export function getSchemaManager(type: string): SchemaManager | undefined {
  return registry.get(type)?.createSchemaManager?.();
}

/**
 * Creates a ConnectionModule via the registry from ONE config bag — the
 * connection's stored config. The connector reads its own keys from it; there
 * is no separate auth object or options bag (#1897).
 */
export function createConnectionModule(type: string, config: ConnectorConfig) {
  const plugin = registry.get(type);
  if (!plugin) {
    const available = registry.getTypes().join(", ");
    throw new Error(
      `Unknown connector type: "${type}". Available: ${available}`,
    );
  }
  return plugin.createModule(config);
}

/**
 * Whatever `type`'s connector raised, as a ConnectorError classified by THAT
 * connector's `classifyError` hook (#1903) — or by the SDK's message-agnostic
 * default when it has none. An error that already is one comes back untouched:
 * the built-ins classify at the point of failure, so this only does work for
 * an error that escaped unwrapped (a constructor throw, a connector that hands
 * `onFail` a raw driver error).
 */
export function toConnectorError(type: string, err: unknown): ConnectorError {
  return wrapError(err, registry.get(type)?.classifyError);
}
