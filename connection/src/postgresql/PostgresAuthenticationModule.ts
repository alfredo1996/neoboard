import { AuthenticationModule } from '../generalized/AuthenticationModule';
import { AuthConfig, DEFAULT_AUTHENTICATION_CONFIG } from '../generalized/interfaces';
import { Pool } from 'pg';

/**
 * PostgreSQL Authentication Module
 * Handles connection pooling and authentication for PostgreSQL databases.
 */
export class PostgresAuthenticationModule extends AuthenticationModule {
  private pool: Pool | null = null;
  protected _authConfig: AuthConfig;

  /**
   * Creates a new PostgreSQL authentication module.
   * @param config - The authentication configuration
   */
  constructor(config: AuthConfig) {
    super();
    this._authConfig = DEFAULT_AUTHENTICATION_CONFIG;
    this._checkConfigurationConsistency(config);
    this._authConfig = config;
    this.pool = this.createDriver();
  }

  /**
   * Creates and returns a new PostgreSQL connection pool (driver).
   * Parses the URI in format: postgresql://user:password@host:port/database
   * @returns The Pool instance
   */
  createDriver(): Pool {
    try {
      // Parse URI
      const url = new URL(this._authConfig.uri);
      const database = url.pathname.slice(1) || 'postgres';

      // Create connection pool
      const pool = new Pool({
        user: this._authConfig.username,
        password: this._authConfig.password,
        host: url.hostname,
        port: parseInt(url.port || '5432', 10),
        database: database,
        connectionTimeoutMillis: 10000,
      });

      // Suppress unhandled errors from idle connections during shutdown
      pool.on('error', (err) => {
        // Only log if this is not a shutdown error
        if (!err.message?.includes('terminating connection')) {
          console.error('Pool error:', err);
        }
      });

      return pool;
    } catch (error) {
      console.error('Failed to create PostgreSQL pool:', error);
      throw error;
    }
  }

  /**
   * Verifies that the connection is working by running a simple query.
   * @returns true if authentication is valid, false if authentication failed
   * @throws Error for connection issues other than authentication
   */
  async verifyAuthentication(): Promise<boolean> {
    try {
      if (!this.pool) {
        this.pool = this.createDriver();
      }

      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        return true;
      } finally {
        client.release();
      }
    } catch (error: any) {
      // Check if this is an authentication error
      if (error.code === '28P01' || error.code === '28000') {
        // Invalid password or invalid authorization specification
        return false;
      }
      // For other errors, throw
      throw error;
    }
  }

  /**
   * Updates the authentication configuration and recreates the connection pool.
   * @param authConfig - The new authentication configuration
   */
  async updateAuthConfig(authConfig: AuthConfig): Promise<void> {
    this._checkConfigurationConsistency(authConfig);
    this._authConfig = authConfig;

    // Close existing pool if present
    if (this.pool) {
      await this.close();
    }

    // Create new pool with updated config
    this.pool = this.createDriver();
  }

  /**
   * Authenticates and establishes a connection pool to PostgreSQL.
   * This is a convenience method that calls verifyAuthentication.
   * @returns true if connection succeeds, false otherwise
   */
  async authenticate(): Promise<boolean> {
    try {
      return await this.verifyAuthentication();
    } catch (error) {
      console.error('PostgreSQL authentication failed:', error);
      return false;
    }
  }

  /**
   * Returns the active connection pool.
   * @returns The Pool instance or null if not connected
   */
  getPool(): Pool | null {
    return this.pool;
  }

  /**
   * Closes all connections in the pool.
   * Properly drains the pool before closing to avoid connection termination errors.
   */
  async close(): Promise<void> {
    if (this.pool) {
      try {
        // Remove error handlers before closing to suppress shutdown errors
        this.pool.removeAllListeners('error');

        // End the pool - drains existing connections and rejects new ones
        await this.pool.end();
      } catch (error) {
        // Suppress "terminating connection" errors during shutdown
        if (!error?.message?.includes('terminating connection')) {
          console.error('Error closing PostgreSQL pool:', error);
        }
      } finally {
        this.pool = null;
      }
    }
  }
}
