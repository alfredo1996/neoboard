/**
 * Query scheduler — priority queue with per-user fairness and backpressure.
 *
 * Used by NeoBoard's query execution pipeline to bound concurrency and
 * keep interactive queries responsive under load. Pure data structure —
 * no I/O, no route handling, no HTTP status mapping. Those responsibilities
 * live in the middleware that wraps this (slice 2 of #129).
 *
 * Design:
 *
 * - Three priority tiers (1=interactive, 2=load, 3=refresh). P1 always
 *   beats P2 which always beats P3.
 *
 * - Within a priority tier, users take turns via round-robin dequeue so
 *   one user with 20 auto-refreshing widgets can't starve another user.
 *
 * - `maxConcurrent` caps the total number of in-flight queries per
 *   scheduler (typically one scheduler per connector).
 *
 * - `maxPerUser` caps a single user's in-flight count — prevents one
 *   user from grabbing every slot even if there is no queued contention.
 *
 * - `maxQueueDepth` caps the queued count. Enqueues beyond the cap are
 *   rejected immediately with `QueueRejectedError` so callers can fail
 *   fast (HTTP 503) instead of piling up.
 *
 * - `queueTimeoutMs` drops waiters that have been sitting too long so
 *   stale queries are evicted if upstream clients have gone away.
 *
 * - `shedThreshold` (0..1) triggers priority shedding: once the queue
 *   fill ratio exceeds the threshold, new P3 (auto-refresh) enqueues
 *   are rejected to protect P1/P2 latency.
 *
 * Async contract:
 *   `enqueue(ticket)` returns a Promise that resolves when the ticket
 *   has been granted a slot (active counts incremented). It rejects
 *   with:
 *     - `QueueRejectedError` on depth limit or shedding
 *     - `QueueTimeoutError` if the wait exceeds `queueTimeoutMs`
 *     - a generic `Error("scheduler shutting down")` on `shutdown()`
 *
 *   The caller MUST call `release(ticketId)` exactly once after the
 *   query finishes (success or failure) so the slot is freed and the
 *   next waiter can be woken.
 */

export type QueryPriority = 1 | 2 | 3;

export interface QueryTicket {
  readonly id: string;
  readonly userId: string;
  readonly connectorId: string;
  readonly priority: QueryPriority;
  readonly enqueuedAt: number;
}

export interface SchedulerOptions {
  /** Max concurrent in-flight queries across all users. */
  readonly maxConcurrent: number;
  /** Max concurrent in-flight queries for a single user. */
  readonly maxPerUser: number;
  /** Max queued queries before new enqueues are rejected. */
  readonly maxQueueDepth: number;
  /** Max wait time in the queue before the waiter is evicted. */
  readonly queueTimeoutMs: number;
  /** Queue fill ratio (0..1) above which new P3 enqueues are shed. */
  readonly shedThreshold: number;
}

export interface SchedulerStats {
  queueDepth: number;
  queueDepthByPriority: { p1: number; p2: number; p3: number };
  activeQueries: number;
  activeByUser: Record<string, number>;
  rejectionsTotal: number;
  shedTotal: number;
  avgWaitMs: number;
}

export class QueueRejectedError extends Error {
  readonly reason: "queue_full" | "shed";
  constructor(reason: "queue_full" | "shed", message: string) {
    super(message);
    this.name = "QueueRejectedError";
    this.reason = reason;
  }
}

export class QueueTimeoutError extends Error {
  constructor(message = "query scheduler queue timeout") {
    super(message);
    this.name = "QueueTimeoutError";
  }
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface Waiter {
  ticket: QueryTicket;
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Per-priority queue: one FIFO of waiters per user. `userOrder`
 * tracks round-robin order across users with non-empty sub-queues.
 */
interface PriorityBucket {
  /** FIFO list of waiters per user. */
  readonly byUser: Map<string, Waiter[]>;
  /** Round-robin rotation order — front is next user to dequeue. */
  readonly userOrder: string[];
}

function createBucket(): PriorityBucket {
  return { byUser: new Map(), userOrder: [] };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export class QueryScheduler {
  private readonly options: SchedulerOptions;
  private readonly buckets: Record<QueryPriority, PriorityBucket> = {
    1: createBucket(),
    2: createBucket(),
    3: createBucket(),
  };
  private readonly active = new Map<string, QueryTicket>();
  private readonly activeByUser = new Map<string, number>();
  private rejectionsTotal = 0;
  private shedTotal = 0;
  private totalWaitMs = 0;
  private completedCount = 0;
  private shuttingDown = false;

  constructor(options: SchedulerOptions) {
    this.options = options;
  }

  /**
   * Enqueue a ticket. Returns a promise that resolves once the ticket
   * is granted a slot, or rejects with one of the scheduler errors.
   */
  enqueue(ticket: QueryTicket): Promise<void> {
    if (this.shuttingDown) {
      return Promise.reject(new Error("scheduler shutting down"));
    }

    // Depth limit check — count queued, not active.
    const depth = this.getQueueDepth();
    if (depth >= this.options.maxQueueDepth) {
      this.rejectionsTotal++;
      return Promise.reject(
        new QueueRejectedError("queue_full", "query scheduler queue full"),
      );
    }

    // Priority shedding — drop P3 when the queue is close to full.
    if (
      ticket.priority === 3 &&
      depth >= this.options.shedThreshold * this.options.maxQueueDepth
    ) {
      this.shedTotal++;
      return Promise.reject(
        new QueueRejectedError(
          "shed",
          "query scheduler shedding P3 (refresh) under load",
        ),
      );
    }

    // Fast path — if a slot is immediately available, grant it.
    if (this.canGrant(ticket.userId)) {
      this.grant(ticket);
      return Promise.resolve();
    }

    // Slow path — queue the waiter with a timeout.
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        ticket,
        resolve,
        reject,
        timer: setTimeout(() => {
          // Remove from queue and reject with timeout.
          this.removeWaiter(ticket.priority, ticket.userId, waiter);
          reject(new QueueTimeoutError());
        }, this.options.queueTimeoutMs),
      };
      this.push(waiter);
    });
  }

  /**
   * Release a previously-granted ticket. Wakes the next eligible waiter
   * if any. Idempotent — releasing an unknown ticket is a no-op.
   */
  release(ticketId: string): void {
    const ticket = this.active.get(ticketId);
    if (!ticket) return;
    this.active.delete(ticketId);
    const count = (this.activeByUser.get(ticket.userId) ?? 1) - 1;
    if (count <= 0) {
      this.activeByUser.delete(ticket.userId);
    } else {
      this.activeByUser.set(ticket.userId, count);
    }
    this.wakeNext();
  }

  /** Current stats snapshot. Safe to call from anywhere, no mutation. */
  getStats(): SchedulerStats {
    const p1 = this.countBucket(1);
    const p2 = this.countBucket(2);
    const p3 = this.countBucket(3);
    return {
      queueDepth: p1 + p2 + p3,
      queueDepthByPriority: { p1, p2, p3 },
      activeQueries: this.active.size,
      activeByUser: Object.fromEntries(this.activeByUser),
      rejectionsTotal: this.rejectionsTotal,
      shedTotal: this.shedTotal,
      avgWaitMs:
        this.completedCount > 0 ? this.totalWaitMs / this.completedCount : 0,
    };
  }

  /**
   * Reject all pending waiters and block new enqueues. Active tickets
   * are left alone so in-flight queries can finish naturally.
   */
  shutdown(): void {
    this.shuttingDown = true;
    for (const priority of [1, 2, 3] as const) {
      const bucket = this.buckets[priority];
      for (const [, waiters] of bucket.byUser) {
        for (const waiter of waiters) {
          clearTimeout(waiter.timer);
          waiter.reject(new Error("scheduler shutting down"));
        }
      }
      bucket.byUser.clear();
      bucket.userOrder.length = 0;
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private canGrant(userId: string): boolean {
    if (this.active.size >= this.options.maxConcurrent) return false;
    const userActive = this.activeByUser.get(userId) ?? 0;
    if (userActive >= this.options.maxPerUser) return false;
    return true;
  }

  private grant(ticket: QueryTicket): void {
    this.active.set(ticket.id, ticket);
    this.activeByUser.set(
      ticket.userId,
      (this.activeByUser.get(ticket.userId) ?? 0) + 1,
    );
    const waited = Date.now() - ticket.enqueuedAt;
    if (waited >= 0) {
      this.totalWaitMs += waited;
      this.completedCount++;
    }
  }

  private push(waiter: Waiter): void {
    const bucket = this.buckets[waiter.ticket.priority];
    const list = bucket.byUser.get(waiter.ticket.userId);
    if (list) {
      list.push(waiter);
    } else {
      bucket.byUser.set(waiter.ticket.userId, [waiter]);
      bucket.userOrder.push(waiter.ticket.userId);
    }
  }

  /**
   * Round-robin dequeue within a single priority. Walks `userOrder`
   * looking for a user whose head waiter is eligible to run (has a
   * per-user slot free). Skips users that are at their per-user cap.
   * Returns the dequeued waiter, or null if nothing in this bucket can
   * run right now.
   */
  private popEligible(priority: QueryPriority): Waiter | null {
    const bucket = this.buckets[priority];
    const order = bucket.userOrder;
    for (let i = 0; i < order.length; i++) {
      const userId = order[i];
      const userActive = this.activeByUser.get(userId) ?? 0;
      if (userActive >= this.options.maxPerUser) continue;
      const list = bucket.byUser.get(userId);
      if (!list || list.length === 0) continue;

      const waiter = list.shift()!;
      // Rotate: remove from front and append if still has queued items.
      order.splice(i, 1);
      if (list.length > 0) {
        order.push(userId);
      } else {
        bucket.byUser.delete(userId);
      }
      return waiter;
    }
    return null;
  }

  /**
   * Try to wake the next eligible waiter. Walks priorities P1 → P2 → P3.
   * Stops as soon as we find one (release only frees one slot).
   */
  private wakeNext(): void {
    if (this.active.size >= this.options.maxConcurrent) return;
    for (const priority of [1, 2, 3] as const) {
      const waiter = this.popEligible(priority);
      if (waiter) {
        clearTimeout(waiter.timer);
        this.grant(waiter.ticket);
        waiter.resolve();
        return;
      }
    }
  }

  private removeWaiter(
    priority: QueryPriority,
    userId: string,
    waiter: Waiter,
  ): void {
    const bucket = this.buckets[priority];
    const list = bucket.byUser.get(userId);
    if (!list) return;
    const idx = list.indexOf(waiter);
    if (idx < 0) return;
    list.splice(idx, 1);
    if (list.length === 0) {
      bucket.byUser.delete(userId);
      const orderIdx = bucket.userOrder.indexOf(userId);
      if (orderIdx >= 0) bucket.userOrder.splice(orderIdx, 1);
    }
  }

  private countBucket(priority: QueryPriority): number {
    let total = 0;
    for (const list of this.buckets[priority].byUser.values()) {
      total += list.length;
    }
    return total;
  }

  private getQueueDepth(): number {
    return this.countBucket(1) + this.countBucket(2) + this.countBucket(3);
  }
}
