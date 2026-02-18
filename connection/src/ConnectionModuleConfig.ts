/**
 * Possible connection types.
 *
 * Note: We don't import the actual modules here to avoid circular dependencies.
 * Use the factory pattern (createConnectionModule) to instantiate modules.
 */
export enum ConnectionTypes {
  NEO4J = 1,
  POSTGRESQL = 2,
}

