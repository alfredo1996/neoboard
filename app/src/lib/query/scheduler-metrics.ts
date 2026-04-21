/**
 * Periodic emitter for scheduler stats.
 *
 * Walks every scheduler in the registry on a fixed interval and emits
 * one structured log entry per non-idle scheduler. Idle schedulers
 * (empty queue, no active queries, no new rejections/sheds since the
 * last tick) are skipped to avoid log spam.
 *
 * Log levels:
 *   - error → at least one new rejection since last tick
 *   - warn  → at least one new shed since last tick, or fill ratio
 *             exceeds the shed threshold right now
 *   - info  → everything else (queue non-empty or active queries present)
 *
 * Started at cold start from `instrumentation.ts` via
 * `startSchedulerMetricsEmitter()`. The returned stop function is
 * mostly used by tests; in production the timer runs for the process
 * lifetime.
 */
import { queryLogger } from "@/lib/logger";
import { listSchedulers } from "./scheduler-registry";
import type { SchedulerStats } from "./scheduler";
import { readSchedulerConfig } from "./scheduler-config";

export interface SchedulerMetricsEntry {
  connectorId: string;
  queueDepth: number;
  queueDepthByPriority: SchedulerStats["queueDepthByPriority"];
  activeQueries: number;
  activeByUser: Record<string, number>;
  rejectionsTotal: number;
  shedTotal: number;
  rejectionsDelta: number;
  shedDelta: number;
  avgWaitMs: number;
  fillRatio: number;
}

export type SchedulerLogLevel = "error" | "warn" | "info";

/** Choose the log level based on delta and fill ratio. */
export function chooseLogLevel(
  entry: SchedulerMetricsEntry,
  shedThreshold: number,
): SchedulerLogLevel {
  if (entry.rejectionsDelta > 0) return "error";
  if (entry.shedDelta > 0 || entry.fillRatio >= shedThreshold) return "warn";
  return "info";
}

/**
 * Determine whether a scheduler is idle (nothing to report).
 * Idle = empty queue, no active queries, and no new rejections/sheds.
 */
export function isIdle(entry: SchedulerMetricsEntry): boolean {
  return (
    entry.queueDepth === 0 &&
    entry.activeQueries === 0 &&
    entry.rejectionsDelta === 0 &&
    entry.shedDelta === 0
  );
}

/**
 * Build a metrics entry for a single scheduler, computing the delta
 * against the previous totals.
 */
export function buildEntry(
  connectorId: string,
  stats: SchedulerStats,
  prevRejections: number,
  prevSheds: number,
  maxQueueDepth: number,
): SchedulerMetricsEntry {
  const rejectionsDelta = Math.max(0, stats.rejectionsTotal - prevRejections);
  const shedDelta = Math.max(0, stats.shedTotal - prevSheds);
  const fillRatio = maxQueueDepth > 0 ? stats.queueDepth / maxQueueDepth : 0;
  return {
    connectorId,
    queueDepth: stats.queueDepth,
    queueDepthByPriority: stats.queueDepthByPriority,
    activeQueries: stats.activeQueries,
    activeByUser: stats.activeByUser,
    rejectionsTotal: stats.rejectionsTotal,
    shedTotal: stats.shedTotal,
    rejectionsDelta,
    shedDelta,
    avgWaitMs: stats.avgWaitMs,
    fillRatio,
  };
}

const DEFAULT_INTERVAL_MS = 30_000;

/**
 * Visible for testing — runs one metrics tick synchronously.
 * Takes the "previous totals" map in/out so callers can chain ticks.
 */
export interface SchedulerMetricsLogger {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

export function _runTick(
  prevTotals: Map<string, { rejections: number; sheds: number }>,
  maxQueueDepth: number,
  shedThreshold: number,
  logger: SchedulerMetricsLogger,
): void {
  for (const { connectionId, scheduler } of listSchedulers()) {
    const stats = scheduler.getStats();
    const prev = prevTotals.get(connectionId) ?? { rejections: 0, sheds: 0 };
    const entry = buildEntry(
      connectionId,
      stats,
      prev.rejections,
      prev.sheds,
      maxQueueDepth,
    );

    if (isIdle(entry)) {
      prevTotals.set(connectionId, {
        rejections: stats.rejectionsTotal,
        sheds: stats.shedTotal,
      });
      continue;
    }

    const level = chooseLogLevel(entry, shedThreshold);
    logger[level]({ event: "scheduler_stats", ...entry }, "scheduler_stats");

    prevTotals.set(connectionId, {
      rejections: stats.rejectionsTotal,
      sheds: stats.shedTotal,
    });
  }
}

/**
 * Start the periodic metrics emitter. Returns a stop function.
 * Idempotent — calling twice while already running is a no-op.
 */
let runningTimer: ReturnType<typeof setInterval> | null = null;

export function startSchedulerMetricsEmitter(
  intervalMs: number = DEFAULT_INTERVAL_MS,
): () => void {
  if (runningTimer) return () => stopSchedulerMetricsEmitter();

  const prevTotals = new Map<string, { rejections: number; sheds: number }>();
  const config = readSchedulerConfig();

  runningTimer = setInterval(() => {
    try {
      _runTick(
        prevTotals,
        config.maxQueueDepth,
        config.shedThreshold,
        queryLogger,
      );
    } catch (err) {
      // Never let a metrics tick crash the process.
      queryLogger.error(
        {
          event: "scheduler_metrics_tick_failed",
          err: err instanceof Error ? err.message : String(err),
        },
        "scheduler_metrics_tick_failed",
      );
    }
  }, intervalMs);

  // Don't keep the event loop alive just for metrics.
  (runningTimer as { unref?: () => void }).unref?.();

  return stopSchedulerMetricsEmitter;
}

export function stopSchedulerMetricsEmitter(): void {
  if (runningTimer) {
    clearInterval(runningTimer);
    runningTimer = null;
  }
}
