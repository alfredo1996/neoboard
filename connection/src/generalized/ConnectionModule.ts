import { AuthenticationModule } from "./AuthenticationModule";
import {
  ConnectionConfig,
  QueryCallback,
  QueryParams,
  QueryStatus,
} from "./interfaces";

export abstract class ConnectionModule {
  abstract authModule: AuthenticationModule;

  protected constructor() {}

  abstract runQuery<T>(
    queryParams: QueryParams,
    callbacks: QueryCallback<T>,
    config: ConnectionConfig,
  ): Promise<void>;

  abstract checkConnection(
    connectionConfig?: ConnectionConfig,
  ): Promise<boolean>;

  /**
   * Lists available databases on the connected server.
   * Returns an empty array if the operation is not supported or fails.
   * Implementations should filter out internal/system databases.
   */
  abstract listDatabases(): Promise<string[]>;

  /**
   * Checks for empty/missing query and sets the appropriate status.
   * Returns true if the query is empty (caller should return early).
   */
  protected handleEmptyQuery<T>(
    query: string | undefined,
    callbacks: QueryCallback<T>,
  ): boolean {
    if (callbacks.setStatus) {
      if (!query || query.trim() === "") {
        callbacks.setStatus(QueryStatus.NO_QUERY);
        return true;
      }
      callbacks.setStatus(QueryStatus.RUNNING);
    }
    return false;
  }
}
