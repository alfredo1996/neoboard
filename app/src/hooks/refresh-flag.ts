import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Connections whose next read must skip the server's introspection cache
 * (#2514): the Model page's and the editor's Refresh. Cleared when the request
 * that follows succeeds, so a later ordinary read is served from the cache again.
 */
const pending = new Set<string>();

/**
 * Marks `key` only when a mounted query will take the mark: with none, the
 * mark would sit until some later ordinary read took it and skipped the cache.
 */
export const markRefresh = (
  queryClient: QueryClient,
  queryKey: QueryKey,
  key: string,
) => {
  if (
    queryClient.getQueryCache().findAll({ queryKey, type: "active" }).length > 0
  ) {
    pending.add(key);
  }
};

/**
 * `?refresh=1` while `key` is marked. Reading does not clear it: a request that
 * fails before the server is retried, and the retry must still skip the cache.
 */
export const peekRefresh = (key: string) =>
  pending.has(key) ? "?refresh=1" : "";

/** Clears the mark once a refresh has been answered. */
export const clearRefresh = (key: string) => {
  pending.delete(key);
};
