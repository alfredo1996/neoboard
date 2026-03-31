/**
 * In-memory rate limiter using a sliding window counter per key (typically IP).
 * Suitable for single-instance deployments. Resets on server restart.
 *
 * Note: In multi-instance deployments (e.g. multiple replicas behind a load
 * balancer), each instance maintains its own map. For distributed rate limiting,
 * replace with a Redis-backed store in a future iteration.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

interface RateLimiterOptions {
  /** Maximum allowed requests per window. */
  maxAttempts: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private maxAttempts: number;
  private windowMs: number;
  private lastCleanup = 0;

  constructor({ maxAttempts, windowMs }: RateLimiterOptions) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  check(key: string): RateLimitResult {
    const now = Date.now();

    // Lazy cleanup: sweep expired entries every 5 minutes to prevent unbounded growth
    if (now - this.lastCleanup > 5 * 60_000) {
      this.lastCleanup = now;
      for (const [k, entry] of this.store) {
        if (now >= entry.resetAt) this.store.delete(k);
      }
    }

    let entry = this.store.get(key);

    // Window expired — start fresh
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.store.set(key, entry);
    }

    entry.count++;

    if (entry.count > this.maxAttempts) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: entry.resetAt - now,
      };
    }

    return {
      allowed: true,
      remaining: this.maxAttempts - entry.count,
    };
  }
}

/** Shared rate limiter instances for auth endpoints. */
export const loginRateLimiter = new RateLimiter({
  maxAttempts: 100,
  windowMs: 60_000,
});

export const signupRateLimiter = new RateLimiter({
  maxAttempts: 10,
  windowMs: 60_000,
});
