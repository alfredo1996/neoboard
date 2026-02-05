import { AuthConfig, AuthType } from './interfaces';

export abstract class AuthenticationModule {
  protected constructor() {}
  abstract createDriver(): any;
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
    if (authConfig.uri == undefined) {
      throw new Error('URI is required');
    }
  }
}
