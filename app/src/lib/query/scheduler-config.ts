import type { SchedulerOptions } from "./scheduler";

/**
 * Read scheduler options from env vars with sensible defaults.
 *
 * Env vars:
 *   QUERY_MAX_CONCURRENT    — max parallel queries per connector     (default: 10)
 *   QUERY_MAX_PER_USER      — max parallel queries per user per conn (default: 5)
 *   QUERY_MAX_QUEUE_DEPTH   — max queued before 503                  (default: 200)
 *   QUERY_QUEUE_TIMEOUT_MS  — max wait in queue before 408           (default: 15000)
 *   QUERY_SHED_THRESHOLD    — queue fill ratio that sheds P3         (default: 0.8)
 *
 * Invalid values fall back to the default and skip the malformed input.
 */

const DEFAULTS: SchedulerOptions = {
  maxConcurrent: 10,
  maxPerUser: 5,
  maxQueueDepth: 200,
  queueTimeoutMs: 15_000,
  shedThreshold: 0.8,
};

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function readRatio(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return fallback;
  return n;
}

export function readSchedulerConfig(): SchedulerOptions {
  return {
    maxConcurrent: readPositiveInt(
      process.env.QUERY_MAX_CONCURRENT,
      DEFAULTS.maxConcurrent,
    ),
    maxPerUser: readPositiveInt(
      process.env.QUERY_MAX_PER_USER,
      DEFAULTS.maxPerUser,
    ),
    maxQueueDepth: readPositiveInt(
      process.env.QUERY_MAX_QUEUE_DEPTH,
      DEFAULTS.maxQueueDepth,
    ),
    queueTimeoutMs: readPositiveInt(
      process.env.QUERY_QUEUE_TIMEOUT_MS,
      DEFAULTS.queueTimeoutMs,
    ),
    shedThreshold: readRatio(
      process.env.QUERY_SHED_THRESHOLD,
      DEFAULTS.shedThreshold,
    ),
  };
}

export const SCHEDULER_DEFAULTS: Readonly<SchedulerOptions> = DEFAULTS;
