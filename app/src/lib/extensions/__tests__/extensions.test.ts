import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Tests — bootstrapExtensions()
// ---------------------------------------------------------------------------

describe("bootstrapExtensions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("returns empty registry when NEOBOARD_EDITION is not set", async () => {
    vi.stubEnv("NEOBOARD_EDITION", "");
    const { bootstrapExtensions } = await import("../extensions");
    const registry = await bootstrapExtensions();
    expect(registry).toBeDefined();
    expect(registry.ssoProviders).toEqual([]);
  });

  it("returns empty registry when NEOBOARD_EDITION is 'community'", async () => {
    vi.stubEnv("NEOBOARD_EDITION", "community");
    const { bootstrapExtensions } = await import("../extensions");
    const registry = await bootstrapExtensions();
    expect(registry.ssoProviders).toEqual([]);
  });

  it("calls enterprise register() when NEOBOARD_EDITION is 'enterprise'", async () => {
    vi.stubEnv("NEOBOARD_EDITION", "enterprise");

    const mockRegister = vi.fn();
    vi.doMock("@neoboard/enterprise", () => ({
      register: mockRegister,
    }));

    const { bootstrapExtensions } = await import("../extensions");
    await bootstrapExtensions();

    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ ssoProviders: expect.any(Array) }),
    );
  });

  it("returns default registry when enterprise module is not installed", async () => {
    vi.stubEnv("NEOBOARD_EDITION", "enterprise");

    vi.doMock("@neoboard/enterprise", () => {
      throw new Error("Cannot find module '@neoboard/enterprise'");
    });

    const { bootstrapExtensions } = await import("../extensions");
    const registry = await bootstrapExtensions();
    // Should not throw — graceful fallback
    expect(registry.ssoProviders).toEqual([]);
  });

  it("getExtensions returns the cached registry after bootstrap", async () => {
    vi.stubEnv("NEOBOARD_EDITION", "");
    const { bootstrapExtensions, getExtensions } =
      await import("../extensions");
    await bootstrapExtensions();
    const registry = getExtensions();
    expect(registry).toBeDefined();
    expect(registry.ssoProviders).toEqual([]);
  });
});
