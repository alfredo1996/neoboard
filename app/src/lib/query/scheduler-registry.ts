import { QueryScheduler, type SchedulerOptions } from "./scheduler";
import { readSchedulerConfig } from "./scheduler-config";

/**
 * Singleton registry of per-connector schedulers.
 *
 * A query that runs against connection `conn-neo4j-001` goes through the
 * scheduler keyed on that connection — separate from queries against
 * `conn-pg-001`. This gives each data source its own concurrency budget
 * and prevents one slow connector from starving another.
 *
 * Schedulers are created lazily on first lookup and share a single
 * config snapshot read at module load. Callers that need to override
 * the config for tests should call `resetSchedulerRegistry()` and pass
 * a custom options object to `getScheduler()`.
 */

const schedulers = new Map<string, QueryScheduler>();
let defaultOptions: SchedulerOptions = readSchedulerConfig();

/**
 * Return the scheduler for a connection id, constructing it lazily on
 * first access.
 */
export function getScheduler(
  connectionId: string,
  options: SchedulerOptions = defaultOptions,
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
  defaultOptions = readSchedulerConfig();
}

/**
 * Overwrite the default scheduler options for tests. The next
 * `getScheduler()` call that constructs a new entry will use these.
 * Existing schedulers are not reconfigured — call
 * `resetSchedulerRegistry()` first if you need a clean slate.
 */
export function setDefaultSchedulerOptions(options: SchedulerOptions): void {
  defaultOptions = options;
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
