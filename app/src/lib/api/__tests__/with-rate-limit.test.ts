import { describe, it, expect, vi } from "vitest";
import { RateLimiter } from "@/lib/crypto/rate-limiter";
import {
  withPublicAuthRateLimit,
  clientIpFromRequest,
} from "../with-rate-limit";

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), init),
  },
}));

function req(ip = "1.2.3.4"): Request {
  return new Request("http://localhost/api/auth/bootstrap-status", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("clientIpFromRequest", () => {
  it("uses the first x-forwarded-for hop", () => {
    const r = new Request("http://x", {
      headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
    });
    expect(clientIpFromRequest(r)).toBe("9.9.9.9");
  });

  it("falls back to 'unknown' when the header is absent", () => {
    expect(clientIpFromRequest(new Request("http://x"))).toBe("unknown");
  });
});

describe("withPublicAuthRateLimit (#819)", () => {
  it("passes through while under the limit", async () => {
    const limiter = new RateLimiter({ maxAttempts: 2, windowMs: 60_000 });
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withPublicAuthRateLimit(handler, limiter);
    expect((await wrapped(req())).status).toBe(200);
    expect((await wrapped(req())).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("returns 429 + Retry-After once the limit is exceeded", async () => {
    const limiter = new RateLimiter({ maxAttempts: 1, windowMs: 60_000 });
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withPublicAuthRateLimit(handler, limiter);
    await wrapped(req());
    const res = await wrapped(req());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(handler).toHaveBeenCalledTimes(1); // not invoked on the blocked call
  });

  it("limits per IP independently", async () => {
    const limiter = new RateLimiter({ maxAttempts: 1, windowMs: 60_000 });
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withPublicAuthRateLimit(handler, limiter);
    await wrapped(req("1.1.1.1"));
    expect(await wrapped(req("2.2.2.2")).then((r) => r.status)).toBe(200);
    expect(await wrapped(req("1.1.1.1")).then((r) => r.status)).toBe(429);
  });
});
