/**
 * Whether the preview "Run" button is disabled (#1048).
 *
 * Derived purely from the current connection, query, and in-flight state, so
 * it re-evaluates on every render — including when a connection is selected
 * (no dead period waiting for the query text to change).
 */
export function isRunDisabled(
  connectionId: string,
  query: string,
  isPending: boolean,
): boolean {
  return !connectionId || !query.trim() || isPending;
}
