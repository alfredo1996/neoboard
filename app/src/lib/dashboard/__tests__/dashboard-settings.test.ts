import { describe, it, expect } from "vitest";
import { getRefetchInterval } from "../dashboard-settings";
import type { DashboardSettings } from "@/lib/db/schema";

describe("getRefetchInterval", () => {
  it("returns false when settings is undefined", () => {
    expect(getRefetchInterval(undefined)).toBe(false);
  });

  it("returns false when autoRefresh is missing", () => {
    expect(getRefetchInterval({} as DashboardSettings)).toBe(false);
  });

  it("returns false when autoRefresh is explicitly false", () => {
    expect(
      getRefetchInterval({
        autoRefresh: false,
        refreshIntervalSeconds: 30,
      } as DashboardSettings),
    ).toBe(false);
  });

  it("applies default 60s interval when autoRefresh=true and no interval specified", () => {
    expect(getRefetchInterval({ autoRefresh: true } as DashboardSettings)).toBe(
      60_000,
    );
  });

  it("clamps to MIN_INTERVAL (5s) when user configures less", () => {
    expect(
      getRefetchInterval({
        autoRefresh: true,
        refreshIntervalSeconds: 2,
      } as DashboardSettings),
    ).toBe(5_000);
  });

  it("respects user-configured interval above the minimum", () => {
    expect(
      getRefetchInterval({
        autoRefresh: true,
        refreshIntervalSeconds: 120,
      } as DashboardSettings),
    ).toBe(120_000);
  });

  it("falls back to default when refreshIntervalSeconds is not finite (NaN)", () => {
    expect(
      getRefetchInterval({
        autoRefresh: true,
        refreshIntervalSeconds: Number.NaN,
      } as DashboardSettings),
    ).toBe(60_000);
  });

  it("falls back to default when refreshIntervalSeconds is Infinity", () => {
    expect(
      getRefetchInterval({
        autoRefresh: true,
        refreshIntervalSeconds: Number.POSITIVE_INFINITY,
      } as DashboardSettings),
    ).toBe(60_000);
  });
});
