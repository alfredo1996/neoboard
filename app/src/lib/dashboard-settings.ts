import type { DashboardSettings } from "@/lib/db/schema";

const MIN_INTERVAL_SECONDS = 30;
const DEFAULT_INTERVAL_SECONDS = 60;

/**
 * Converts dashboard auto-refresh settings into a TanStack Query
 * `refetchInterval` value (milliseconds or `false` to disable).
 */
export function getRefetchInterval(settings?: DashboardSettings): number | false {
  if (!settings?.autoRefresh) return false;
  const seconds = settings.refreshIntervalSeconds ?? DEFAULT_INTERVAL_SECONDS;
  return Math.max(seconds, MIN_INTERVAL_SECONDS) * 1000;
}
