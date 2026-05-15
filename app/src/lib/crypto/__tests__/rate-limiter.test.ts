import { describe, it, expect } from "vitest";
import { RateLimiter } from "@/lib/crypto/rate-limiter";

describe("RateLimiter", () => {
  it("allows requests within the limit", () => {
    const limiter = new RateLimiter({ maxAttempts: 3, windowMs: 60_000 });
    expect(limiter.check("user-1").allowed).toBe(true);
    expect(limiter.check("user-1").allowed).toBe(true);
    expect(limiter.check("user-1").allowed).toBe(true);
  });

  it("blocks requests exceeding the limit", () => {
    const limiter = new RateLimiter({ maxAttempts: 2, windowMs: 60_000 });
    limiter.check("user-1");
    limiter.check("user-1");
    const result = limiter.check("user-1");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("isolates different keys", () => {
    const limiter = new RateLimiter({ maxAttempts: 1, windowMs: 60_000 });
    limiter.check("user-1");
    expect(limiter.check("user-1").allowed).toBe(false);
    expect(limiter.check("user-2").allowed).toBe(true);
  });

  it("tracks remaining attempts", () => {
    const limiter = new RateLimiter({ maxAttempts: 3, windowMs: 60_000 });
    expect(limiter.check("user-1").remaining).toBe(2);
    expect(limiter.check("user-1").remaining).toBe(1);
    expect(limiter.check("user-1").remaining).toBe(0);
  });
});
