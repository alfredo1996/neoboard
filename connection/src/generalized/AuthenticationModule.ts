import { AuthConfig, AuthType } from './interfaces';
import { Pool } from 'pg';
import { Driver } from 'neo4j-driver-core';

export abstract class AuthenticationModule {
  protected constructor() {}
  abstract createDriver(): Pool | Driver;
  abstract verifyAuthentication(): Promise<boolean>;
  abstract updateAuthConfig(_authConfig: AuthConfig): Promise<void>;
  _checkConfigurationConsistency(authConfig: AuthConfig): void {
    if (authConfig == undefined) {
      throw new Error('Connection config is required');
    }
    if (authConfig.authType == undefined) {
      throw new Error('Authentication type is required');
    }
    if (authConfig.authType == AuthType.EMPTY) {
      throw new Error('Authentication type is Empty. Please provide a username and password');
    }
    if (authConfig.uri == undefined || authConfig.uri.trim() === '') {
      throw new Error('URI is required');
    }
  }

  /**
   * Validates a URI has a valid hostname and port.
   * @param uri - The URI to validate
   * @param allowedProtocols - List of allowed protocol prefixes (e.g., ['postgresql:', 'postgres:'])
   * @throws Error if the URI is malformed, missing hostname, or has invalid port
   */
  protected _validateUri(uri: string, allowedProtocols: string[]): void {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new Error(`Invalid URI format: unable to parse "${uri}"`);
    }

    if (!parsed.hostname) {
      throw new Error('URI must contain a hostname');
    }

    if (allowedProtocols.length > 0 && !allowedProtocols.includes(parsed.protocol)) {
      throw new Error(`Invalid URI protocol "${parsed.protocol}". Expected one of: ${allowedProtocols.join(', ')}`);
    }

    if (parsed.port) {
      const port = parseInt(parsed.port, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port in URI: "${parsed.port}"`);
      }
    }
  }
}
