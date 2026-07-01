import { getConnector } from "./connection-adapter";

/**
 * True if `type` is a registered connector (built-in or external), driven by
 * the runtime registry (#1121) — so a registry-supplied connector is
 * first-class, with no hardcoded `"neo4j" | "postgresql"` union in
 * validation/execution.
 *
 * Server-side only (the registry pulls DB drivers). Routed through
 * connection-adapter so it stays mockable in unit tests.
 */
export function isRegisteredConnectorType(type: string): boolean {
  return getConnector(type) !== undefined;
}
