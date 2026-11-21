import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Connections whose next read must skip the server's introspection cache
 * (#2514): the Model page's and the editor's Refresh. Taken by the request
 * that follows, so a later ordinary read is served from the cache again.
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
  if (queryClient.getQueryCache().find({ queryKey, type: "active" })) {
    pending.add(key);
  }
};

/** `?refresh=1` when `key` was marked, else nothing; clears the mark. */
export const takeRefresh = (key: string) =>
  pending.delete(key) ? "?refresh=1" : "";
