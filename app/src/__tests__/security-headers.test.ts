import { describe, it, expect, afterEach, beforeEach } from "vitest";

/**
 * Verify that next.config.ts exports the expected security response headers.
 *
 * We dynamically import the config (ESM default export) and call its
 * `headers()` function, then assert on the returned header list.
 */
describe("security response headers", () => {
  const originalForceHttps = process.env.FORCE_HTTPS;

  beforeEach(() => {
    delete process.env.FORCE_HTTPS;
  });

  afterEach(() => {
    if (originalForceHttps === undefined) {
      delete process.env.FORCE_HTTPS;
    } else {
      process.env.FORCE_HTTPS = originalForceHttps;
    }
  });

  it("exports a headers function that returns security headers for all routes", async () => {
    // next.config.ts uses import.meta.dirname — Vitest handles this natively.
    const mod = await import("../../next.config");
    const nextConfig = mod.default;

    expect(nextConfig.headers).toBeDefined();
    expect(typeof nextConfig.headers).toBe("function");

    const result = await nextConfig.headers!();

    // Should have exactly one entry covering all routes
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("/:path*");

    const headers = result[0].headers;

    // Build a lookup for easier assertions
    const headerMap = Object.fromEntries(
      headers.map((h: { key: string; value: string }) => [h.key, h.value]),
    );

    expect(headerMap["X-Frame-Options"]).toBe("DENY");
    expect(headerMap["X-Content-Type-Options"]).toBe("nosniff");
    expect(headerMap["Referrer-Policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headerMap["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });

  it("does NOT emit Strict-Transport-Security by default (safe for http://localhost demos)", async () => {
    const mod = await import("../../next.config");
    const nextConfig = mod.default;
    const result = await nextConfig.headers!();
    const headers = result[0].headers;
    const hsts = headers.find(
      (h: { key: string }) => h.key === "Strict-Transport-Security",
    );
    expect(hsts).toBeUndefined();
  });

  it("emits Strict-Transport-Security when FORCE_HTTPS=true (production opt-in)", async () => {
    // headers() reads process.env at invocation, so a single import is fine.
    const mod = await import("../../next.config");
    const nextConfig = mod.default;
    process.env.FORCE_HTTPS = "true";
    const result = await nextConfig.headers!();
    const headers = result[0].headers;
    const headerMap = Object.fromEntries(
      headers.map((h: { key: string; value: string }) => [h.key, h.value]),
    );
    expect(headerMap["Strict-Transport-Security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });

  it("does NOT include Content-Security-Policy (deferred — needs ECharts/Leaflet/NVL tuning)", async () => {
    const mod = await import("../../next.config");
    const nextConfig = mod.default;
    const result = await nextConfig.headers!();
    const headers = result[0].headers;

    const cspHeader = headers.find(
      (h: { key: string }) => h.key === "Content-Security-Policy",
    );
    expect(cspHeader).toBeUndefined();
  });
});
