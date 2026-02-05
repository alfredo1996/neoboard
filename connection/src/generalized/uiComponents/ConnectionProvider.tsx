import React, { useEffect, useRef, useState } from 'react';
import { AuthConfig, AuthType, ConnectionConfig } from '../interfaces';
import { ConnectionContext } from './ConnectionContext';
import { AuthenticationModule } from '../AuthenticationModule';
import { TYPE_TO_CONNECTION_CLASSES } from '../../ConnectionModuleConfig';
import { ConnectionModule } from '../ConnectionModule';

export interface ConnectionProviderProps {
  authConfig: AuthConfig;
  connectionConfig: ConnectionConfig;
  children: React.ReactNode;
}

export const ConnectionProvider: React.FC<ConnectionProviderProps> = (props: ConnectionProviderProps) => {
  const { connectionModule, authenticationModule } = TYPE_TO_CONNECTION_CLASSES[props.connectionConfig.connectionType];
  const { authConfig, connectionConfig } = props;
  const [connectionConfigState, setConnectionConfigState] = useState<ConnectionConfig>(connectionConfig);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  const connectionModuleRef = useRef<ConnectionModule | undefined>(undefined);

  /**
   * Get the connection module instance.
   * @returns {ConnectionModule | undefined} The connection module instance.
   */
  const getConnectionModule = (): ConnectionModule | undefined => {
    return connectionModuleRef.current;
  };

  /**
   * Update the authentication config and create a new authentication module.
   * Will throw an error if the authentication fails for any other reason besides authentication errors;
   * @param newAuthConfig AuthConfig to test
   * @returns {boolean} True if the authentication is valid, false if there's an authentication issue,
   * throws an Exception with any other kind of error
   */
  const updateAuthConfig = async (
    newAuthConfig: AuthConfig
  ): Promise<{
    isAuthenticated: boolean;
    connectionModule?: ConnectionModule;
  }> => {
    const authModule: AuthenticationModule = new authenticationModule(newAuthConfig);
    let instance: ConnectionModule;

    const onAuthSuccess = async () => {
      if (connectionModuleRef.current) {
        await connectionModuleRef.current.authModule.updateAuthConfig(newAuthConfig);
        instance = connectionModuleRef.current;
      } else {
        instance = new connectionModule<ConnectionModule>(newAuthConfig);
        connectionModuleRef.current = instance;
      }
      setIsAuthenticated(true);
      return instance;
    };

    const onAuthFailure = () => {
      setIsAuthenticated(false);
    };

    try {
      const tmpAuth = await authModule.verifyAuthentication();
      if (tmpAuth) {
        const module = await onAuthSuccess();
        return { isAuthenticated: true, connectionModule: module };
      } else {
        onAuthFailure();
        return { isAuthenticated: false };
      }
    } catch (error) {
      console.error('Error verifying authentication:', error);
      onAuthFailure();
      throw error;
    }
  };

  /**
   * Check the authentication config.
   * Will throw an error if the authentication fails for any other reason besides authentication errors;
   * @returns {boolean} True if the authentication is valid, false if there's an authentication issue,
   * throws an Exception with any other kind of error
   * @param authConfig
   */
  const checkConnection = async (authConfig: AuthConfig, database): Promise<boolean> => {
    let instance: ConnectionModule;

    if (connectionModuleRef.current) {
      await connectionModuleRef.current.authModule.updateAuthConfig(authConfig);
      instance = connectionModuleRef.current;
    } else {
      instance = new connectionModule<ConnectionModule>(authConfig);
      connectionModuleRef.current = instance;
    }

    try {
      // We update the state of Connection Config
      updateConnectionConfig({ ...connectionConfigState, database: database });
      // in CheckConnection we send a copy of connectionConfigState because the state change is async
      const result = await instance.checkConnection({ ...connectionConfigState, database: database });
      setIsAuthenticated(true);
      return result;
    } catch (error) {
      console.error('Error verifying authentication or connection:', error);
      setIsAuthenticated(false);
      throw error;
    }
  };

  const updateConnectionConfig = (newConnectionConfig: ConnectionConfig) => {
    setConnectionConfigState(newConnectionConfig);
  };

  useEffect(() => {
    updateConnectionConfig(connectionConfig);
  }, [connectionConfig]);

  useEffect(() => {
    const update = async () => {
      try {
        // In the first RUN we don't need to create the Driver.
        if (authConfig.authType !== AuthType.EMPTY) {
          await updateAuthConfig(authConfig);
        }
      } catch (error) {
        console.error('Error updating authentication config:', error);
        setIsAuthenticated(false);
      }
    };

    update();
  }, [authConfig]);

  return (
    <ConnectionContext.Provider
      value={{
        isAuthenticated,
        connectionConfig: connectionConfigState,
        updateConnectionConfig,
        updateAuthConfig,
        getConnectionModule,
        checkConnection,
      }}
    >
      {props.children}
    </ConnectionContext.Provider>
  );
};
