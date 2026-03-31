/**
 * In-memory rate limiter using a sliding window counter per key (typically IP).
 * Suitable for single-instance deployments. Resets on server restart.
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

  constructor({ maxAttempts, windowMs }: RateLimiterOptions) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    let entry = this.store.get(key);

    // Window expired — reset
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
  maxAttempts: 5,
  windowMs: 60_000,
});

export const signupRateLimiter = new RateLimiter({
  maxAttempts: 3,
  windowMs: 60_000,
});
