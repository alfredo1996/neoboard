import { AuthenticationModule } from "@neoboard/connector-sdk";
import { AuthConfig, PostgresAdvancedOptions } from "@neoboard/connector-sdk";
import { Pool } from "pg";
import { isAuthenticationError, attachClientErrorGuard } from "./utils";

/**
 * Translate libpq's `sslmode` into node-pg's `ssl` option (#1299).
 *
 * Every managed Postgres — RDS, Cloud SQL, Neon, Supabase, Heroku — hands the
 * user a URI ending in `?sslmode=require`. We parsed the URI for host, port and
 * database and ignored the query string entirely, so those connections were
 * made in PLAINTEXT with nothing in the UI or the logs to say so.
 *
 * libpq semantics, which are not the same as "on/off":
 *   disable                  no TLS at all
 *   allow / prefer           opportunistic; libpq falls back to plaintext.
 *                            node-pg cannot negotiate a fallback, so we do the
 *                            secure half — encrypt without demanding a
 *                            verifiable chain — rather than silently not
 *                            encrypting.
 *   require                  encrypt, do NOT verify the certificate
 *   verify-ca / verify-full  encrypt AND verify
 *
 * Returns undefined for an absent or unrecognised value, preserving the
 * previous "no ssl key" behaviour for connections that never asked for TLS.
 */
export function sslFromSslMode(
  sslmode: string | null,
): false | { rejectUnauthorized: boolean } | undefined {
  switch (sslmode?.trim().toLowerCase()) {
    case "disable":
      return false;
    case "allow":
    case "prefer":
    case "require":
      return { rejectUnauthorized: false };
    case "verify-ca":
    case "verify-full":
      return { rejectUnauthorized: true };
    default:
      return undefined;
  }
}

/**
 * PostgreSQL Authentication Module
 * Handles connection pooling and authentication for PostgreSQL databases.
 */
export class PostgresAuthenticationModule extends AuthenticationModule {
  private pool: Pool | null = null;
  private _poolInitPromise: Promise<boolean> | null = null;
  protected _authConfig!: AuthConfig;
  private readonly _advancedOptions?: PostgresAdvancedOptions;

  /**
   * Creates a new PostgreSQL authentication module.
   * @param config - The authentication configuration
   * @param advancedOptions - Optional advanced pool/timeout settings
   */
  constructor(config: AuthConfig, advancedOptions?: PostgresAdvancedOptions) {
    super();
    this._checkConfigurationConsistency(config);
    this._validateUri(config.uri, ["postgresql:", "postgres:"]);
    this._authConfig = config;
    this._advancedOptions = advancedOptions;
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
      const database = url.pathname.slice(1) || "postgres";

      // Build SSL config. The explicit advanced option wins — an operator set
      // it deliberately in the connection form, and a query param inherited
      // from a copy-pasted URI must not silently override that. Otherwise fall
      // back to the URI's sslmode, which every managed Postgres includes and
      // which we previously discarded, silently connecting in plaintext to
      // databases that asked for TLS (#1299).
      const ssl =
        this._advancedOptions?.pgSslRejectUnauthorized === undefined
          ? sslFromSslMode(url.searchParams.get("sslmode"))
          : {
              rejectUnauthorized: this._advancedOptions.pgSslRejectUnauthorized,
            };

      // Create connection pool
      const pool = new Pool({
        user: this._authConfig.username,
        password: this._authConfig.password,
        host: url.hostname,
        port: parseInt(url.port || "5432", 10),
        database: database,
        connectionTimeoutMillis:
          this._advancedOptions?.pgConnectionTimeoutMillis ?? 10000,
        idleTimeoutMillis: this._advancedOptions?.pgIdleTimeoutMillis ?? 10000,
        max: this._advancedOptions?.pgMaxPoolSize ?? 10,
        // `!== undefined`, not truthiness: sslmode=disable resolves to the
        // boolean false, which is a deliberate "no TLS" instruction and must
        // reach the pool rather than being dropped as falsy (#1299).
        ...(ssl !== undefined ? { ssl } : {}),
      });

      // Suppress unhandled errors from idle connections during shutdown
      pool.on("error", (err) => {
        // Only log error code/type if this is not a shutdown error — never log the full error
        if (!err.message?.includes("terminating connection")) {
          // pg errors carry a `code` (SQLSTATE) that plain Error doesn't declare
          console.error(
            "Pool error:",
            (err as Error & { code?: string }).code ?? "unknown",
          );
        }
      });

      return pool;
    } catch (error) {
      // Log only error type — never the full error which may contain credentials
      const code =
        error instanceof Error ? error.message.split(":")[0] : "unknown";
      console.error("Failed to create PostgreSQL pool:", code);
      throw error;
    }
  }

  /**
   * Verifies that the connection is working by running a simple query.
   * @returns true if authentication is valid, false if authentication failed
   * @throws Error for connection issues other than authentication
   */
  async verifyAuthentication(): Promise<boolean> {
    // Prevent concurrent callers from creating duplicate pools.
    // The first caller creates the promise; subsequent callers await the same one.
    if (this._poolInitPromise) return this._poolInitPromise;

    this._poolInitPromise = this._verifyAuthenticationImpl();
    try {
      return await this._poolInitPromise;
    } finally {
      this._poolInitPromise = null;
    }
  }

  private async _verifyAuthenticationImpl(): Promise<boolean> {
    try {
      if (!this.pool) {
        this.pool = this.createDriver();
      }

      const client = await this.pool.connect();
      const releaseErrorGuard = attachClientErrorGuard(client);
      try {
        await client.query("SELECT 1");
        return true;
      } finally {
        releaseErrorGuard();
        client.release();
      }
    } catch (error: unknown) {
      if (isAuthenticationError(error)) {
        return false;
      }
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
        this.pool.removeAllListeners("error");

        // End the pool - drains existing connections and rejects new ones
        await this.pool.end();
      } catch (error) {
        // Suppress "terminating connection" errors during shutdown — never log full error
        const msg = error instanceof Error ? error.message : "";
        if (!msg.includes("terminating connection")) {
          console.error(
            "Error closing PostgreSQL pool:",
            msg.split(":")[0] || "unknown",
          );
        }
      } finally {
        this.pool = null;
      }
    }
  }
}
