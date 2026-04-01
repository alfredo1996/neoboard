/**
 * Canonical connector type constants.
 *
 * Single source of truth for all connector type strings used across the app.
 * Import these instead of hardcoding "neo4j" or "postgresql" strings.
 * When adding a new connector, update this file — all consumers will follow.
 */

/** All supported connector type identifiers. */
export const CONNECTOR_TYPES = ["neo4j", "postgresql"] as const;

/** Union type of supported connector types. */
export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

/** Human-readable labels for each connector type. */
export const CONNECTOR_LABELS: Record<ConnectorType, string> = {
  neo4j: "Neo4j",
  postgresql: "PostgreSQL",
};

/** Query language used by each connector type. */
export const CONNECTOR_LANGUAGES: Record<ConnectorType, string> = {
  neo4j: "Cypher",
  postgresql: "SQL",
};
