import type { SchedulerOptions } from "./scheduler";
import { SETTINGS, getSetting } from "@/lib/settings/core";

/**
 * The scheduler's caps, read through `getSetting` (#2416): locked env, then an
 * admin's value, then env, then the default. Synchronous and cached, so it is
 * safe wherever a scheduling decision is made.
 *
 *   QUERY_MAX_CONCURRENT    max parallel queries per connector     (default: 10)
 *   QUERY_MAX_PER_USER      max parallel queries per user per conn (default: 5)
 *   QUERY_MAX_QUEUE_DEPTH   max queued before 503                  (default: 200)
 *   QUERY_QUEUE_TIMEOUT_MS  max wait in queue before 408           (default: 15000)
 *   QUERY_SHED_THRESHOLD    queue fill ratio that sheds P3         (default: 0.8)
 */
export function readSchedulerConfig(): SchedulerOptions {
  return {
    maxConcurrent: getSetting("QUERY_MAX_CONCURRENT"),
    maxPerUser: getSetting("QUERY_MAX_PER_USER"),
    maxQueueDepth: getSetting("QUERY_MAX_QUEUE_DEPTH"),
    queueTimeoutMs: getSetting("QUERY_QUEUE_TIMEOUT_MS"),
    shedThreshold: getSetting("QUERY_SHED_THRESHOLD"),
  };
}

export const SCHEDULER_DEFAULTS: Readonly<SchedulerOptions> = {
  maxConcurrent: SETTINGS.QUERY_MAX_CONCURRENT.default,
  maxPerUser: SETTINGS.QUERY_MAX_PER_USER.default,
  maxQueueDepth: SETTINGS.QUERY_MAX_QUEUE_DEPTH.default,
  queueTimeoutMs: SETTINGS.QUERY_QUEUE_TIMEOUT_MS.default,
  shedThreshold: SETTINGS.QUERY_SHED_THRESHOLD.default,
};
