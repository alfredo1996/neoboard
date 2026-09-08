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

  /**
   * Run one query and report through `callbacks`.
   *
   * Contract: a failure inside the connector — authentication, connection,
   * the query itself, a timeout — is reported through `onFail` (and
   * `setStatus`) and the returned promise resolves. Exactly one of
   * `onSuccess` / `onFail` fires per call.
   *
   * The consumer's own `onSuccess` is not part of that error path: if it
   * throws, the connector must NOT roll back, must NOT set `ERROR`, and must
   * NOT call `onFail`. The exception propagates and rejects the returned
   * promise, so the caller sees its own bug rather than a database failure
   * (#1642). The query-safety conformance harness checks this.
   */
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
   *
   * Returning true means the connector does NOT run the query — so this must
   * settle the caller itself. `runQuery` is consumed as a promise that resolves
   * only through `onSuccess`/`onFail`; returning early with neither left that
   * promise pending forever, holding its scheduler slot. `maxConcurrent`
   * whitespace-only queries were enough to wedge a connector until the process
   * restarted (#1301).
   *
   * Settled as success-with-no-rows rather than failure: `NO_QUERY` already
   * carries the meaning, and treating a blank widget query as an error would
   * paint a red error state on every dashboard that has one.
   */
  protected handleEmptyQuery<T>(
    query: string | undefined,
    callbacks: QueryCallback<T>,
  ): boolean {
    if (callbacks.setStatus) {
      if (!query || query.trim() === "") {
        callbacks.setStatus(QueryStatus.NO_QUERY);
        callbacks.onSuccess?.([] as T);
        return true;
      }
      callbacks.setStatus(QueryStatus.RUNNING);
    }
    return false;
  }
}
