import { describe, it, expect } from "vitest";
import { resolveCacheOptions } from "../resolve-cache-options";

describe("resolveCacheOptions", () => {
  it("returns TTL-based staleTime when cacheMode is 'ttl' and cache is enabled", () => {
    const result = resolveCacheOptions({ cacheMode: "ttl" }, true, 5);
    expect(result.staleTime).toBe(300_000); // 5 * 60_000
    expect(result.gcTime).toBeUndefined();
    expect(result.forceRefreshButton).toBe(false);
  });

  it("returns staleTime 0 when cacheMode is 'ttl' and cache is disabled", () => {
    const result = resolveCacheOptions({ cacheMode: "ttl" }, false, 5);
    expect(result.staleTime).toBe(0);
    expect(result.gcTime).toBeUndefined();
    expect(result.forceRefreshButton).toBe(false);
  });

  it("returns Infinity staleTime and gcTime when cacheMode is 'forever'", () => {
    const result = resolveCacheOptions({ cacheMode: "forever" }, true, 5);
    expect(result.staleTime).toBe(Infinity);
    expect(result.gcTime).toBe(Infinity);
    expect(result.forceRefreshButton).toBe(true);
  });

  it("returns Infinity even when enableCache is false for 'forever' mode", () => {
    const result = resolveCacheOptions({ cacheMode: "forever" }, false, 5);
    expect(result.staleTime).toBe(Infinity);
    expect(result.gcTime).toBe(Infinity);
    expect(result.forceRefreshButton).toBe(true);
  });

  it("defaults to 'ttl' when cacheMode is not set", () => {
    const result = resolveCacheOptions({}, true, 10);
    expect(result.staleTime).toBe(600_000); // 10 * 60_000
    expect(result.gcTime).toBeUndefined();
    expect(result.forceRefreshButton).toBe(false);
  });

  it("defaults to 'ttl' when chartOptions is empty and uses cacheTtlMinutes", () => {
    const result = resolveCacheOptions({}, true, 5);
    expect(result.staleTime).toBe(300_000);
    expect(result.forceRefreshButton).toBe(false);
  });
});
