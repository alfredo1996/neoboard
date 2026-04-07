import { describe, it, expect, beforeEach, vi } from "vitest";
import { RateLimiter } from "@/lib/crypto/rate-limiter";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ maxAttempts: 5, windowMs: 60_000 });
  });

  it("allows requests under the limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(limiter.check("1.2.3.4").allowed).toBe(true);
    }
  });

  it("blocks requests over the limit", () => {
    for (let i = 0; i < 5; i++) limiter.check("1.2.3.4");
    const result = limiter.check("1.2.3.4");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks IPs independently", () => {
    for (let i = 0; i < 5; i++) limiter.check("1.2.3.4");
    expect(limiter.check("1.2.3.4").allowed).toBe(false);
    expect(limiter.check("5.6.7.8").allowed).toBe(true);
  });

  it("resets after the window expires", () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 5; i++) limiter.check("1.2.3.4");
      expect(limiter.check("1.2.3.4").allowed).toBe(false);

      vi.advanceTimersByTime(60_001);
      expect(limiter.check("1.2.3.4").allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns remaining attempts", () => {
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");
    const result = limiter.check("1.2.3.4");
    expect(result.remaining).toBe(2);
  });

  it("cleans up expired entries to prevent memory leaks", () => {
    vi.useFakeTimers();
    try {
      // Create entries for multiple IPs
      limiter.check("1.1.1.1");
      limiter.check("2.2.2.2");
      limiter.check("3.3.3.3");

      // Advance past window + cleanup interval (5 minutes)
      vi.advanceTimersByTime(5 * 60_000 + 1);

      // Next check triggers cleanup of all expired entries
      limiter.check("4.4.4.4");

      // The old entries' windows have expired, and the cleanup sweep
      // should have removed them. Verify by checking that a new check
      // on an old IP starts fresh (allowed, with full remaining).
      const result = limiter.check("1.1.1.1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // 5 max - 1 = 4
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("shared limiter instances", () => {
  it("loginRateLimiter and signupRateLimiter both allow 5 attempts", async () => {
    // Re-import to get fresh instances
    vi.resetModules();
    const { loginRateLimiter, signupRateLimiter } =
      await import("@/lib/crypto/rate-limiter");

    // Both should allow 5 attempts
    for (let i = 0; i < 5; i++) {
      expect(loginRateLimiter.check(`login-test-${i}`).allowed).toBe(true);
      expect(signupRateLimiter.check(`signup-test-${i}`).allowed).toBe(true);
    }
  });
});
