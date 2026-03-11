/**
 * Pure function that determines TanStack Query cache options based on
 * the widget's chartOptions.cacheMode, enableCache, and cacheTtlMinutes.
 *
 * When cacheMode is "forever", staleTime and gcTime are both Infinity,
 * and forceRefreshButton is true (so the user always has a way to re-fetch).
 *
 * When cacheMode is "ttl" (default), the existing TTL-based caching applies.
 */
export function resolveCacheOptions(
  chartOptions: Record<string, unknown>,
  enableCache: boolean,
  cacheTtlMinutes: number,
): { staleTime: number; gcTime?: number; forceRefreshButton: boolean } {
  if (chartOptions.cacheMode === "forever") {
    return { staleTime: Infinity, gcTime: Infinity, forceRefreshButton: true };
  }

  return {
    staleTime: enableCache ? cacheTtlMinutes * 60_000 : 0,
    gcTime: undefined,
    forceRefreshButton: false,
  };
}
