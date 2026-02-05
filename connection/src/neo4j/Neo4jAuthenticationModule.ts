import { AuthenticationModule } from '../generalized/AuthenticationModule';
import { AuthConfig, AuthType, DEFAULT_AUTHENTICATION_CONFIG } from '../generalized/interfaces';
import neo4j from 'neo4j-driver';
import { Driver } from 'neo4j-driver-core';

export class Neo4jAuthenticationModule extends AuthenticationModule {
  private _authConfig: AuthConfig;
  private driver: Driver;

  constructor(authConfig: any) {
    super();
    this._authConfig = DEFAULT_AUTHENTICATION_CONFIG;
    this._checkConfigurationConsistency(authConfig);
    this._authConfig = authConfig;
    this.driver = this.createDriver();
  }

  getDriver(): Driver {
    if (!this.driver) {
      return this.createDriver();
    }
    return this.driver;
  }

  /**
   * Verify the authentication of the driver. It will check if the driver is connected and if the authentication is valid.
   * It will return true if the authentication is valid, false otherwise.
   * It will raise an error if the driver can't connect due to other reasons besides wrong auth.
   * @returns {Promise<boolean>} True if the authentication is valid, false if there's an authentication
   * issue, and rejected with error for any other exception
   */
  async verifyAuthentication(): Promise<boolean> {
    return await this.driver.verifyAuthentication();
  }

  /**
   * Update the authentication configuration of the driver.
   * @param authConfig The new authentication configuration.
   */
  async updateAuthConfig(authConfig: AuthConfig): Promise<void> {
    this._checkConfigurationConsistency(authConfig);
    this._authConfig = authConfig;
    if (this.driver) {
      await this.driver.close();
    }
    this.driver = this.createDriver();
  }

  /**
   * Create a new Neo4j driver instance.
   * @returns {Driver} The Neo4j driver instance.
   */
  createDriver(): Driver {
    // TODO: Implement Neo4j SSO
    const auth =
      this._authConfig.authType === AuthType.NATIVE
        ? neo4j.auth.basic(this._authConfig.username, this._authConfig.password)
        : undefined;
    return neo4j.driver(this._authConfig.uri, auth);
  }
}
