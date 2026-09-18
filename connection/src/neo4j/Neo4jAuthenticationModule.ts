import { AuthenticationModule } from "@neoboard/connector-sdk";
import { AuthConfig, AuthType, ConnectorConfig } from "@neoboard/connector-sdk";
import neo4j from "neo4j-driver";
import { Driver } from "neo4j-driver-core";
import { optionalNumber, toAuthConfig, uriProtocols } from "../config-bag";
import { neo4jDescriptor } from "./descriptor";

export class Neo4jAuthenticationModule extends AuthenticationModule {
  private _authConfig!: AuthConfig;
  private readonly _config: ConnectorConfig;
  private driver!: Driver;

  /**
   * @param config - The connection's config bag, keyed by the descriptor's
   *   field keys. Auth and driver options are both read from it.
   */
  constructor(config: ConnectorConfig) {
    super();
    if (config == undefined) throw new Error("Connection config is required");
    const authConfig = toAuthConfig(config);
    this._checkConfigurationConsistency(authConfig);
    this._validateUri(authConfig.uri, uriProtocols(neo4jDescriptor));
    this._authConfig = authConfig;
    this._config = config;
    this.driver = this.createDriver();
  }

  getDriver(): Driver {
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
    if (this._authConfig.authType === AuthType.SINGLE_SIGN_ON) {
      throw new Error("Neo4j SSO authentication is not yet supported");
    }
    const auth =
      this._authConfig.authType === AuthType.NATIVE
        ? neo4j.auth.basic(this._authConfig.username, this._authConfig.password)
        : undefined;
    const connectionTimeout =
      optionalNumber(this._config.connectionTimeout) ?? 30000;
    return neo4j.driver(this._authConfig.uri, auth, {
      connectionTimeout,
      maxConnectionPoolSize: optionalNumber(this._config.maxPoolSize),
      // Left unset, the driver waits its own 60 s default to acquire a
      // connection — doubling every attempt against a dead host (#1678).
      // Pinned just ABOVE the connect timeout, not equal to it: the pool
      // arms its acquisition timer before the socket arms its connect timer,
      // so an equal value fires first and a dead host reads as a retryable
      // pool timeout instead of the connect failure the API maps to
      // CONNECTOR_UNAVAILABLE.
      connectionAcquisitionTimeout:
        optionalNumber(this._config.connectionAcquisitionTimeout) ??
        connectionTimeout + 5000,
      // Queries run through executeRead/executeWrite, which retry
      // ServiceUnavailable for the driver's 30 s default. Against a dead host
      // the connect failure is instant and all 30 s is backoff: a widget sat
      // on its skeleton for 30 s where the connection test, a plain
      // session.run, failed in 100 ms (#1888). The cost is that a transient
      // cluster error surfaces instead of being retried here; the widget
      // recovers on its next refresh.
      maxTransactionRetryTime: 0,
    });
  }

  /**
   * Close the driver and release all connections.
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
    }
  }
}
