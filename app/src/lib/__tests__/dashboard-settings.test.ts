import { describe, expect, it } from "vitest";
import { getRefetchInterval } from "../dashboard-settings";

describe("getRefetchInterval", () => {
  it("returns false when settings is undefined", () => {
    expect(getRefetchInterval(undefined)).toBe(false);
  });

  it("returns false when autoRefresh is false", () => {
    expect(getRefetchInterval({ autoRefresh: false })).toBe(false);
  });

  it("returns false when autoRefresh is not set", () => {
    expect(getRefetchInterval({})).toBe(false);
  });

  it("returns 60000ms (default 60s) when autoRefresh is true with no interval", () => {
    expect(getRefetchInterval({ autoRefresh: true })).toBe(60_000);
  });

  it("returns 30000ms for 30-second interval", () => {
    expect(getRefetchInterval({ autoRefresh: true, refreshIntervalSeconds: 30 })).toBe(30_000);
  });

  it("returns 300000ms for 5-minute interval", () => {
    expect(getRefetchInterval({ autoRefresh: true, refreshIntervalSeconds: 300 })).toBe(300_000);
  });

  it("clamps to minimum 30s when interval is below 30", () => {
    expect(getRefetchInterval({ autoRefresh: true, refreshIntervalSeconds: 10 })).toBe(30_000);
  });

  it("clamps to minimum 30s when interval is 1", () => {
    expect(getRefetchInterval({ autoRefresh: true, refreshIntervalSeconds: 1 })).toBe(30_000);
  });
});
