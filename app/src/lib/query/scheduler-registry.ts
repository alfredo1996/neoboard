import { QueryScheduler, type SchedulerOptions } from "./scheduler";
import { readSchedulerConfig } from "./scheduler-config";
import { onSettingsChange } from "@/lib/settings/core";

/**
 * Singleton registry of per-connector schedulers.
 *
 * A query that runs against connection `conn-001` goes through the
 * scheduler keyed on that connection — separate from queries against
 * `conn-pg-001`. This gives each data source its own concurrency budget
 * and prevents one slow connector from starving another.
 *
 * Schedulers are created lazily on first lookup and share a single
 * config snapshot read at module load. Callers that need to override
 * the config for tests should call `resetSchedulerRegistry()` and pass
 * a custom options object to `getScheduler()`.
 */

// On globalThis for the reason the extensions registry is (#1888): a
// production build gives instrumentation.ts and each route handler their own
// copy of this module. The scheduler middleware runs from instrumentation's
// copy; the connection-test route (#1426) and /api/health read their own. One
// Map per copy meant one connection had several schedulers, each with a full
// budget.
const globalRegistry = globalThis as typeof globalThis & {
  __neoboardSchedulers?: Map<string, QueryScheduler>;
};
const schedulers = (globalRegistry.__neoboardSchedulers ??= new Map());
// Shared like the map: the settings listener below pushes new caps into it
// from whichever bundle copy registered last.
const defaults = ((
  globalRegistry as { __neoboardSchedulerDefaults?: { o: SchedulerOptions } }
).__neoboardSchedulerDefaults ??= { o: readSchedulerConfig() });

// An admin changed a cap (#2416): every live scheduler takes it from its next
// scheduling decision, no restart.
onSettingsChange("schedulers", () => {
  defaults.o = readSchedulerConfig();
  for (const scheduler of schedulers.values()) scheduler.setOptions(defaults.o);
});

/**
 * Return the scheduler for a connection id, constructing it lazily on
 * first access.
 */
export function getScheduler(
  connectionId: string,
  options: SchedulerOptions = defaults.o,
): QueryScheduler {
  let existing = schedulers.get(connectionId);
  if (!existing) {
    existing = new QueryScheduler(options);
    schedulers.set(connectionId, existing);
  }
  return existing;
}

/**
 * Shutdown every scheduler and clear the registry. Used by the server
 * on graceful shutdown and by tests between runs.
 */
export function resetSchedulerRegistry(): void {
  for (const scheduler of schedulers.values()) {
    scheduler.shutdown();
  }
  schedulers.clear();
  defaults.o = readSchedulerConfig();
}

/**
 * Overwrite the default scheduler options for tests. The next
 * `getScheduler()` call that constructs a new entry will use these.
 * Existing schedulers are not reconfigured — call
 * `resetSchedulerRegistry()` first if you need a clean slate.
 */
export function setDefaultSchedulerOptions(options: SchedulerOptions): void {
  defaults.o = options;
}

/**
 * Return a list of all active scheduler entries — used by the metrics
 * slice (#562) to emit periodic stats.
 */
export function listSchedulers(): Array<{
  connectionId: string;
  scheduler: QueryScheduler;
}> {
  return Array.from(schedulers.entries()).map(([connectionId, scheduler]) => ({
    connectionId,
    scheduler,
  }));
}
