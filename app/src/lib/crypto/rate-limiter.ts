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

/**
 * Shared rate limiter instances for auth endpoints.
 * In test/E2E environments, limits are relaxed to avoid false failures
 * from rapid sequential logins across test cases.
 */
const isTest = process.env.NODE_ENV === "test" || process.env.CI === "true";

export const loginRateLimiter = new RateLimiter({
  maxAttempts: isTest ? 1000 : 20,
  windowMs: 60_000,
});

export const signupRateLimiter = new RateLimiter({
  maxAttempts: isTest ? 100 : 10,
  windowMs: 60_000,
});

/**
 * Per-user query rate limiter.
 * Limits how many queries a single user can execute per minute.
 * Configurable via QUERY_RATE_LIMIT env var (default: 60 per minute).
 */
const queryLimit = parseInt(process.env.QUERY_RATE_LIMIT ?? "60", 10);
export const queryRateLimiter = new RateLimiter({
  maxAttempts: isTest ? 10_000 : queryLimit,
  windowMs: 60_000,
});
