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

/**
 * A widget's cache options from its settings, with the card's defaults (cache
 * on, 5 minutes). The staleTime is part of the widget query key, so every
 * reader of a card's cached result must derive it here, as the card does.
 */
export function resolveWidgetCacheOptions(
  settings: Record<string, unknown> | undefined,
) {
  const ws = settings ?? {};
  return resolveCacheOptions(
    (ws.chartOptions ?? {}) as Record<string, unknown>,
    ws.enableCache !== false,
    (ws.cacheTtlMinutes as number | undefined) ?? 5,
  );
}

/**
 * Determines whether a widget should show the refresh button in its card header.
 * True when the user explicitly enabled it, when cache-forever mode is active,
 * or when manual-run mode is enabled (needs refresh to re-trigger the query).
 */
export function shouldShowRefreshButton(
  chartOptions: Record<string, unknown>,
): boolean {
  return (
    chartOptions.showRefreshButton === true ||
    chartOptions.cacheMode === "forever" ||
    chartOptions.manualRun === true
  );
}
