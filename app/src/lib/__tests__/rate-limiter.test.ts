import { describe, it, expect, beforeEach, vi } from "vitest";
import { RateLimiter } from "../rate-limiter";

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
    for (let i = 0; i < 5; i++) limiter.check("1.2.3.4");
    expect(limiter.check("1.2.3.4").allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
    vi.useRealTimers();
  });

  it("returns remaining attempts", () => {
    limiter.check("1.2.3.4");
    limiter.check("1.2.3.4");
    const result = limiter.check("1.2.3.4");
    expect(result.remaining).toBe(2);
  });
});
