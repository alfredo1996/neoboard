import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLoadSsoProviders = vi.fn();
const mockLoadEnvSsoProvider = vi.fn();

vi.mock("../provider-loader", () => ({
  loadSsoProviders: (...args: unknown[]) => mockLoadSsoProviders(...args),
}));

vi.mock("../env-provider", () => ({
  loadEnvSsoProvider: () => mockLoadEnvSsoProvider(),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getCachedSsoProviders", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockLoadEnvSsoProvider.mockReturnValue(null); // default: no env provider
    vi.doMock("../provider-loader", () => ({
      loadSsoProviders: (...args: unknown[]) => mockLoadSsoProviders(...args),
    }));
    vi.doMock("../env-provider", () => ({
      loadEnvSsoProvider: () => mockLoadEnvSsoProvider(),
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

  it("returns empty array when loadSsoProviders throws and no env provider", async () => {
    mockLoadSsoProviders.mockRejectedValue(new Error("DB down"));

    const { getCachedSsoProviders } = await import("../provider-cache");
    const result = await getCachedSsoProviders("default");

    expect(result).toEqual([]);
  });

  it("prepends env provider before DB providers", async () => {
    const envProvider = { id: "sso-env-oidc", name: "Env SSO" };
    const dbProvider = { id: "sso-db-1", name: "DB SSO" };
    mockLoadEnvSsoProvider.mockReturnValue(envProvider);
    mockLoadSsoProviders.mockResolvedValue([dbProvider]);

    const { getCachedSsoProviders } = await import("../provider-cache");
    const result = await getCachedSsoProviders("default");

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("sso-env-oidc");
    expect(result[1].id).toBe("sso-db-1");
  });

  it("returns only env provider when DB fails", async () => {
    const envProvider = { id: "sso-env-oidc", name: "Env SSO" };
    mockLoadEnvSsoProvider.mockReturnValue(envProvider);
    mockLoadSsoProviders.mockRejectedValue(new Error("DB down"));

    const { getCachedSsoProviders } = await import("../provider-cache");
    const result = await getCachedSsoProviders("default");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sso-env-oidc");
  });

  it("returns only DB providers when env provider is not configured", async () => {
    mockLoadEnvSsoProvider.mockReturnValue(null);
    mockLoadSsoProviders.mockResolvedValue([{ id: "sso-1", name: "DB" }]);

    const { getCachedSsoProviders } = await import("../provider-cache");
    const result = await getCachedSsoProviders("default");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sso-1");
  });
});
