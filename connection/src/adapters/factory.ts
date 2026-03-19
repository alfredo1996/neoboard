import { Neo4jConnectionModule } from '../neo4j/Neo4jConnectionModule';
import { PostgresConnectionModule } from '../postgresql/PostgresConnectionModule';
import { ConnectionTypes } from '../ConnectionModuleConfig';
import { AuthConfig, AdvancedConnectionOptions } from '../generalized/interfaces';
import { ConnectionModule } from '../generalized/ConnectionModule';

/**
 * Factory function to create the appropriate connection module based on database type.
 * @param type - The connection type (neo4j, postgresql, etc)
 * @param authConfig - The authentication configuration
 * @param advancedOptions - Optional advanced pool/timeout settings
 * @returns A new instance of the requested connection module
 * @throws Error if the connection type is not supported
 */
export function createConnectionModule(
  type: ConnectionTypes,
  authConfig: AuthConfig,
  advancedOptions?: AdvancedConnectionOptions
): ConnectionModule {
  switch (type) {
    case ConnectionTypes.NEO4J:
      return new Neo4jConnectionModule(authConfig, advancedOptions);

    case ConnectionTypes.POSTGRESQL:
      return new PostgresConnectionModule(authConfig, advancedOptions);

    default:
      throw new Error(`Unsupported connection type: ${type}`);
  }
}
