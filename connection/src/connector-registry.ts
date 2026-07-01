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
 * Factory function — drop-in replacement for the old factory.ts.
 * Creates a ConnectionModule via the registry.
 */
export function createConnectionModule(
  type: string,
  authConfig: Record<string, unknown>,
  advancedOptions?: Record<string, unknown>,
) {
  const plugin = registry.get(type);
  if (!plugin) {
    const available = registry.getTypes().join(", ");
    throw new Error(
      `Unknown connector type: "${type}". Available: ${available}`,
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return plugin.createModule(authConfig as any, advancedOptions);
}
