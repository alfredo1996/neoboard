import { NextResponse } from "next/server";
import { RateLimiter } from "@/lib/crypto/rate-limiter";

/**
 * Per-IP rate limit for public, unauthenticated `/api/auth/*` routes (#819).
 * These hit the DB on every call with no auth, so they're trivially
 * floodable for CPU exhaustion. 60 req/min/IP is generous for legitimate
 * use (bootstrap-status renders once per login-page load) while capping
 * abuse. In-memory — sufficient for the single-instance v1 target.
 */
const isTest = process.env.NODE_ENV === "test" || process.env.CI === "true";

export const publicAuthRateLimiter = new RateLimiter({
  maxAttempts: isTest ? 10_000 : 60,
  windowMs: 60_000,
});

/** First x-forwarded-for hop (the client IP set by a trusted proxy), else unknown. */
export function clientIpFromRequest(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  );
}

/**
 * Wrap a public route handler with per-IP rate limiting. On limit, returns
 * 429 + Retry-After (seconds) — the established backpressure pattern (#802).
 */
export function withPublicAuthRateLimit(
  handler: (request: Request) => Promise<Response> | Response,
  limiter: RateLimiter = publicAuthRateLimiter,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const result = limiter.check(clientIpFromRequest(request));
    if (!result.allowed) {
      const retryAfterSec = Math.ceil((result.retryAfterMs ?? 60_000) / 1000);
      return NextResponse.json(
        {
          data: null,
          error: { code: "RATE_LIMITED", message: "Too many requests" },
        },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
      );
    }
    return handler(request);
  };
}
