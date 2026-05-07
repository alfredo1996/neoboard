import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLoadSsoProviders = vi.fn();

vi.mock("../provider-loader", () => ({
  loadSsoProviders: (...args: unknown[]) => mockLoadSsoProviders(...args),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getCachedSsoProviders", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("../provider-loader", () => ({
      loadSsoProviders: (...args: unknown[]) => mockLoadSsoProviders(...args),
    }));
  });

  it("calls loadSsoProviders on first call (cache miss)", async () => {
    const providers = [{ id: "sso-1", name: "Test" }];
    mockLoadSsoProviders.mockResolvedValue(providers);

    const { getCachedSsoProviders } = await import("../provider-cache");
    const result = await getCachedSsoProviders("default");

    expect(mockLoadSsoProviders).toHaveBeenCalledWith("default");
    expect(result).toEqual(providers);
  });

  it("returns cached result on second call within TTL", async () => {
    const providers = [{ id: "sso-1", name: "Test" }];
    mockLoadSsoProviders.mockResolvedValue(providers);

    const { getCachedSsoProviders } = await import("../provider-cache");
    await getCachedSsoProviders("default");
    await getCachedSsoProviders("default");

    expect(mockLoadSsoProviders).toHaveBeenCalledTimes(1);
  });

  it("caches separately per tenantId", async () => {
    mockLoadSsoProviders.mockResolvedValue([]);

    const { getCachedSsoProviders } = await import("../provider-cache");
    await getCachedSsoProviders("tenant-a");
    await getCachedSsoProviders("tenant-b");

    expect(mockLoadSsoProviders).toHaveBeenCalledTimes(2);
    expect(mockLoadSsoProviders).toHaveBeenCalledWith("tenant-a");
    expect(mockLoadSsoProviders).toHaveBeenCalledWith("tenant-b");
  });

  it("re-fetches after cache expires", async () => {
    vi.useFakeTimers();
    const providers = [{ id: "sso-1", name: "Test" }];
    mockLoadSsoProviders.mockResolvedValue(providers);

    const { getCachedSsoProviders } = await import("../provider-cache");
    await getCachedSsoProviders("default");
    expect(mockLoadSsoProviders).toHaveBeenCalledTimes(1);

    // Advance past the 60s TTL
    vi.advanceTimersByTime(61_000);

    await getCachedSsoProviders("default");
    expect(mockLoadSsoProviders).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("invalidateProviderCache clears cache for a tenant", async () => {
    const providers = [{ id: "sso-1", name: "Test" }];
    mockLoadSsoProviders.mockResolvedValue(providers);

    const { getCachedSsoProviders, invalidateProviderCache } =
      await import("../provider-cache");
    await getCachedSsoProviders("default");
    expect(mockLoadSsoProviders).toHaveBeenCalledTimes(1);

    invalidateProviderCache("default");

    await getCachedSsoProviders("default");
    expect(mockLoadSsoProviders).toHaveBeenCalledTimes(2);
  });

  it("returns empty array when loadSsoProviders throws", async () => {
    mockLoadSsoProviders.mockRejectedValue(new Error("DB down"));

    const { getCachedSsoProviders } = await import("../provider-cache");
    const result = await getCachedSsoProviders("default");

    expect(result).toEqual([]);
  });
});
