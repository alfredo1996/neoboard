import { getConnector, getAllConnectors } from "./connection-adapter";

/**
 * Connector-type membership checks driven by the runtime registry (#1121),
 * so a registry-supplied connector is first-class — no hardcoded
 * `"neo4j" | "postgresql"` union in validation/execution.
 *
 * Server-side only (the registry pulls DB drivers). Routed through
 * connection-adapter so it stays mockable in unit tests.
 */

/** True if `type` is a registered connector (built-in or external). */
export function isRegisteredConnectorType(type: string): boolean {
  return getConnector(type) !== undefined;
}

/** All registered connector type identifiers. */
export function registeredConnectorTypes(): string[] {
  return getAllConnectors().map((p) => p.type);
}
