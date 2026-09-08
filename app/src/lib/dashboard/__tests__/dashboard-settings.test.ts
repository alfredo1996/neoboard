import { describe, it, expect } from "vitest";
import { getRefetchInterval } from "../dashboard-settings";

describe("getRefetchInterval", () => {
  it("returns false when settings is undefined", () => {
    expect(getRefetchInterval(undefined)).toBe(false);
  });

  it("returns false when autoRefresh is missing", () => {
    expect(getRefetchInterval({})).toBe(false);
  });

  it("returns false when autoRefresh is explicitly false", () => {
    // A configured interval must not re-enable refresh on its own.
    expect(
      getRefetchInterval({ autoRefresh: false, refreshIntervalSeconds: 30 }),
    ).toBe(false);
  });

  it("applies default 60s interval when autoRefresh=true and no interval specified", () => {
    expect(getRefetchInterval({ autoRefresh: true })).toBe(60_000);
  });

  it("clamps to MIN_INTERVAL (5s) when user configures less", () => {
    expect(
      getRefetchInterval({ autoRefresh: true, refreshIntervalSeconds: 1 }),
    ).toBe(5_000);
    expect(
      getRefetchInterval({ autoRefresh: true, refreshIntervalSeconds: 2 }),
    ).toBe(5_000);
    expect(
      getRefetchInterval({ autoRefresh: true, refreshIntervalSeconds: 3 }),
    ).toBe(5_000);
  });

  it("respects user-configured interval above the minimum", () => {
    expect(
      getRefetchInterval({ autoRefresh: true, refreshIntervalSeconds: 30 }),
    ).toBe(30_000);
    expect(
      getRefetchInterval({ autoRefresh: true, refreshIntervalSeconds: 120 }),
    ).toBe(120_000);
    expect(
      getRefetchInterval({ autoRefresh: true, refreshIntervalSeconds: 300 }),
    ).toBe(300_000);
  });

  it("falls back to default when refreshIntervalSeconds is not finite (NaN)", () => {
    expect(
      getRefetchInterval({
        autoRefresh: true,
        refreshIntervalSeconds: Number.NaN,
      }),
    ).toBe(60_000);
  });

  it("falls back to default when refreshIntervalSeconds is Infinity", () => {
    expect(
      getRefetchInterval({
        autoRefresh: true,
        refreshIntervalSeconds: Number.POSITIVE_INFINITY,
      }),
    ).toBe(60_000);
    expect(
      getRefetchInterval({
        autoRefresh: true,
        refreshIntervalSeconds: Number.NEGATIVE_INFINITY,
      }),
    ).toBe(60_000);
  });
});
