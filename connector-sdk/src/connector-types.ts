/**
 * Canonical connector type constants.
 *
 * Single source of truth for all connector type strings used across
 * app, component, and connection packages.
 */

export const CONNECTOR_TYPES = ["neo4j", "postgresql"] as const;

export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

export const CONNECTOR_LABELS: Record<ConnectorType, string> = {
  neo4j: "Neo4j",
  postgresql: "PostgreSQL",
};
