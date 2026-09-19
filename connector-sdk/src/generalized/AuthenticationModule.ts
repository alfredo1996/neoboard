import { AuthConfig, AuthType } from "./interfaces";
import { validateUri } from "./validate-uri";

export abstract class AuthenticationModule {
  protected constructor() {}
  abstract createDriver(): unknown;
  abstract verifyAuthentication(): Promise<boolean>;
  abstract updateAuthConfig(_authConfig: AuthConfig): Promise<void>;
  _checkConfigurationConsistency(authConfig: AuthConfig): void {
    if (authConfig == undefined) {
      throw new Error("Connection config is required");
    }
    if (authConfig.authType == undefined) {
      throw new Error("Authentication type is required");
    }
    if (authConfig.authType == AuthType.EMPTY) {
      throw new Error(
        "Authentication type is Empty. Please provide a username and password",
      );
    }
    if (authConfig.uri == undefined || authConfig.uri.trim() === "") {
      throw new Error("URI is required");
    }
  }

  /**
   * Validates a URI has a valid hostname and port. Delegates to the standalone
   * {@link validateUri}, which `validateConfig` shares — one URI rule set.
   * @throws Error if the URI is malformed, missing hostname, or has invalid port
   */
  protected _validateUri(uri: string, allowedProtocols: string[]): void {
    validateUri(uri, allowedProtocols);
  }
}
