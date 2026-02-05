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

/**
 * Legacy - kept for backwards compatibility but not used.
 * Use createConnectionModule() from src/adapters/factory.ts instead.
 */
export const TYPE_TO_CONNECTION_CLASSES = {};
