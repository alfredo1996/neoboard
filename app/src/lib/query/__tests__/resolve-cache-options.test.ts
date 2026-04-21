import { describe, it, expect } from "vitest";
import {
  resolveCacheOptions,
  shouldShowRefreshButton,
} from "../resolve-cache-options";

describe("resolveCacheOptions", () => {
  it("returns infinite cache + force-refresh button for cacheMode='forever'", () => {
    const opts = resolveCacheOptions({ cacheMode: "forever" }, true, 10);
    expect(opts.staleTime).toBe(Infinity);
    expect(opts.gcTime).toBe(Infinity);
    expect(opts.forceRefreshButton).toBe(true);
  });

  it("forever cache wins even when enableCache=false and ttl=0", () => {
    const opts = resolveCacheOptions({ cacheMode: "forever" }, false, 0);
    expect(opts.staleTime).toBe(Infinity);
  });

  it("uses TTL-based staleTime when enableCache=true and cacheMode !== 'forever'", () => {
    const opts = resolveCacheOptions({}, true, 5);
    expect(opts.staleTime).toBe(5 * 60_000);
    expect(opts.gcTime).toBeUndefined();
    expect(opts.forceRefreshButton).toBe(false);
  });

  it("sets staleTime=0 when enableCache=false", () => {
    const opts = resolveCacheOptions({}, false, 10);
    expect(opts.staleTime).toBe(0);
    expect(opts.forceRefreshButton).toBe(false);
  });

  it("unrecognised cacheMode falls through to TTL branch", () => {
    const opts = resolveCacheOptions({ cacheMode: "weird" }, true, 7);
    expect(opts.staleTime).toBe(7 * 60_000);
    expect(opts.forceRefreshButton).toBe(false);
  });
});

describe("shouldShowRefreshButton", () => {
  it("returns true when showRefreshButton is explicitly true", () => {
    expect(shouldShowRefreshButton({ showRefreshButton: true })).toBe(true);
  });

  it("returns true when cacheMode='forever'", () => {
    expect(shouldShowRefreshButton({ cacheMode: "forever" })).toBe(true);
  });

  it("returns true when manualRun is enabled", () => {
    expect(shouldShowRefreshButton({ manualRun: true })).toBe(true);
  });

  it("returns false for an empty chartOptions object", () => {
    expect(shouldShowRefreshButton({})).toBe(false);
  });

  it("returns false when showRefreshButton is not strictly true", () => {
    expect(shouldShowRefreshButton({ showRefreshButton: "yes" })).toBe(false);
    expect(shouldShowRefreshButton({ showRefreshButton: 1 })).toBe(false);
  });

  it("returns false when manualRun is not strictly true", () => {
    expect(shouldShowRefreshButton({ manualRun: "yes" })).toBe(false);
  });

  it("returns false when cacheMode is 'ttl' (default)", () => {
    expect(shouldShowRefreshButton({ cacheMode: "ttl" })).toBe(false);
  });
});
