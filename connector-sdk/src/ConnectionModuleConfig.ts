/**
 * Possible connection types.
 *
 * Note: We don't import the actual modules here to avoid circular dependencies.
 * Use the factory pattern (createConnectionModule) to instantiate modules.
 */
export enum ConnectionTypes {
  /** Registry-supplied connector with no built-in numeric identity (#1121). */
  UNKNOWN = 0,
  NEO4J = 1,
  POSTGRESQL = 2,
}
