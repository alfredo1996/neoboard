import { ConnectionModule } from '../ConnectionModule';
import { AuthConfig, ConnectionConfig } from '../interfaces';
import { createContext } from 'react';

/**
 * The Neo4jContextState interface defines the shape of the context state for the Neo4j connection module.
 */
export interface ConnectionContextState {
  isAuthenticated: boolean;
  connectionConfig: ConnectionConfig;
  updateAuthConfig: (
    authConfig: AuthConfig
  ) => Promise<{ isAuthenticated: boolean; connectionModule?: ConnectionModule }>;
  updateConnectionConfig: (connectionConfig: ConnectionConfig) => void;
  getConnectionModule: () => ConnectionModule | undefined;
  checkConnection: (authConfig: AuthConfig, database) => Promise<boolean | undefined>;
}
/**
 * The Neo4jContext is a React context that provides access to the Neo4j connection module and authentication configuration across the application.
 */
export const ConnectionContext = createContext<ConnectionContextState>({} as ConnectionContextState);
