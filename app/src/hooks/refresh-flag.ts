/**
 * Connections whose next read must skip the server's introspection cache
 * (#2514): the Model page's and the editor's Refresh. Taken by the request
 * that follows, so a later ordinary read is served from the cache again.
 */
const pending = new Set<string>();

export const markRefresh = (key: string) => {
  pending.add(key);
};

/** `?refresh=1` when `key` was marked, else nothing; clears the mark. */
export const takeRefresh = (key: string) =>
  pending.delete(key) ? "?refresh=1" : "";
