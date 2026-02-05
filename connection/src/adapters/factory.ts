import { Neo4jConnectionModule } from '../neo4j/Neo4jConnectionModule';
import { PostgresConnectionModule } from '../postgresql/PostgresConnectionModule';
import { ConnectionTypes } from '../ConnectionModuleConfig';
import { AuthConfig } from '../generalized/interfaces';
import { ConnectionModule } from '../generalized/ConnectionModule';

/**
 * Factory function to create the appropriate connection module based on database type.
 * @param type - The connection type (neo4j, postgresql, etc)
 * @param authConfig - The authentication configuration
 * @returns A new instance of the requested connection module
 * @throws Error if the connection type is not supported
 */
export function createConnectionModule(
  type: ConnectionTypes,
  authConfig: AuthConfig
): ConnectionModule {
  switch (type) {
    case ConnectionTypes.NEO4J:
      return new Neo4jConnectionModule(authConfig);

    case ConnectionTypes.POSTGRESQL:
      return new PostgresConnectionModule(authConfig);

    default:
      throw new Error(`Unsupported connection type: ${type}`);
  }
}

/**
 * Gets the name of a connection type for display purposes.
 * @param type - The connection type
 * @returns Human-readable name
 */
export function getConnectionTypeName(type: ConnectionTypes): string {
  switch (type) {
    case ConnectionTypes.NEO4J:
      return 'Neo4j';
    case ConnectionTypes.POSTGRESQL:
      return 'PostgreSQL';
    default:
      return 'Unknown';
  }
}

/**
 * Gets all supported connection types.
 * @returns Array of supported connection types
 */
export function getSupportedConnectionTypes(): ConnectionTypes[] {
  return [ConnectionTypes.NEO4J, ConnectionTypes.POSTGRESQL];
}
