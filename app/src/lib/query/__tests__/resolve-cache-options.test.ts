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
    expect(opts.gcTime).toBe(Infinity);
    expect(opts.forceRefreshButton).toBe(true);
  });

  it("uses TTL-based staleTime when enableCache=true and cacheMode is explicitly 'ttl'", () => {
    const opts = resolveCacheOptions({ cacheMode: "ttl" }, true, 5);
    expect(opts.staleTime).toBe(300_000); // 5 * 60_000
    expect(opts.gcTime).toBeUndefined();
    expect(opts.forceRefreshButton).toBe(false);
  });

  it("sets staleTime=0 when enableCache=false and cacheMode is explicitly 'ttl'", () => {
    const opts = resolveCacheOptions({ cacheMode: "ttl" }, false, 5);
    expect(opts.staleTime).toBe(0);
    expect(opts.gcTime).toBeUndefined();
    expect(opts.forceRefreshButton).toBe(false);
  });

  it("defaults to the TTL branch when cacheMode is not set", () => {
    expect(resolveCacheOptions({}, true, 5).staleTime).toBe(5 * 60_000);

    const opts = resolveCacheOptions({}, true, 10);
    expect(opts.staleTime).toBe(600_000); // 10 * 60_000
    expect(opts.gcTime).toBeUndefined();
    expect(opts.forceRefreshButton).toBe(false);
  });

  it("sets staleTime=0 when enableCache=false and cacheMode is not set", () => {
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

  it("returns true when cacheMode='forever', whatever showRefreshButton says", () => {
    expect(shouldShowRefreshButton({ cacheMode: "forever" })).toBe(true);
    expect(
      shouldShowRefreshButton({
        cacheMode: "forever",
        showRefreshButton: false,
      }),
    ).toBe(true);
    expect(
      shouldShowRefreshButton({
        cacheMode: "forever",
        showRefreshButton: true,
      }),
    ).toBe(true);
  });

  it("returns true when manualRun is enabled, whatever showRefreshButton says", () => {
    expect(shouldShowRefreshButton({ manualRun: true })).toBe(true);
    expect(
      shouldShowRefreshButton({ manualRun: true, showRefreshButton: false }),
    ).toBe(true);
    expect(
      shouldShowRefreshButton({ manualRun: true, cacheMode: "forever" }),
    ).toBe(true);
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
    expect(
      shouldShowRefreshButton({ cacheMode: "ttl", showRefreshButton: false }),
    ).toBe(false);
  });
});
