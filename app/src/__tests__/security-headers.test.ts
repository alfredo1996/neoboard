import { describe, it, expect } from "vitest";

/**
 * Verify that next.config.ts exports the expected security response headers.
 *
 * We dynamically import the config (ESM default export) and call its
 * `headers()` function, then assert on the returned header list.
 */
describe("security response headers", () => {
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
