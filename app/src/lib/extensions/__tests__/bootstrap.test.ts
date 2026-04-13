import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("bootstrapExtensions", () => {
  const originalEdition = process.env.NEOBOARD_EDITION;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEdition === undefined) {
      delete process.env.NEOBOARD_EDITION;
    } else {
      process.env.NEOBOARD_EDITION = originalEdition;
    }
  });

  it("is a no-op in community edition", async () => {
    delete process.env.NEOBOARD_EDITION;
    const { bootstrapExtensions } = await import("../bootstrap");
    const { extensions } = await import("../index");
    const result = await bootstrapExtensions();
    expect(result.edition).toBe("community");
    expect(result.enterpriseLoaded).toBe(false);
    expect(extensions.authProviders.size()).toBe(0);
  });

  it("reports enterprise edition and attempts to load the enterprise package", async () => {
    process.env.NEOBOARD_EDITION = "enterprise";
    const { bootstrapExtensions } = await import("../bootstrap");
    const result = await bootstrapExtensions();
    expect(result.edition).toBe("enterprise");
    // Enterprise package does not exist yet — bootstrap should
    // not throw, just report enterpriseLoaded=false
    expect(result.enterpriseLoaded).toBe(false);
  });

  it("is idempotent — calling twice does not double-register", async () => {
    delete process.env.NEOBOARD_EDITION;
    const { bootstrapExtensions } = await import("../bootstrap");
    const { extensions } = await import("../index");
    await bootstrapExtensions();
    await bootstrapExtensions();
    expect(extensions.authProviders.size()).toBe(0);
  });

  it("registers enterprise extensions when loader returns a module", async () => {
    process.env.NEOBOARD_EDITION = "enterprise";
    const { bootstrapExtensions } = await import("../bootstrap");
    const { extensions } = await import("../index");

    const loader = vi.fn(async () => ({
      register: (exts: typeof extensions) => {
        exts.authProviders.register({
          id: "test-oidc",
          label: "Test OIDC",
          buildProvider: () => ({ id: "oidc" }),
        });
      },
    }));

    const result = await bootstrapExtensions(loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(result.edition).toBe("enterprise");
    expect(result.enterpriseLoaded).toBe(true);
    expect(result.errors).toEqual([]);
    expect(extensions.authProviders.size()).toBe(1);
    expect(extensions.authProviders.getFirst()?.id).toBe("test-oidc");
  });

  it("records an error when the loader throws", async () => {
    process.env.NEOBOARD_EDITION = "enterprise";
    const { bootstrapExtensions } = await import("../bootstrap");

    const loader = vi.fn(async () => {
      throw new Error("boom");
    });

    const result = await bootstrapExtensions(loader);

    expect(result.edition).toBe("enterprise");
    expect(result.enterpriseLoaded).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("boom");
  });

  it("records an error when the register function throws", async () => {
    process.env.NEOBOARD_EDITION = "enterprise";
    const { bootstrapExtensions } = await import("../bootstrap");

    const loader = vi.fn(async () => ({
      register: () => {
        throw new Error("register failed");
      },
    }));

    const result = await bootstrapExtensions(loader);

    expect(result.enterpriseLoaded).toBe(false);
    expect(result.errors[0]).toContain("register failed");
  });

  it("does not call the loader in community edition", async () => {
    delete process.env.NEOBOARD_EDITION;
    const { bootstrapExtensions } = await import("../bootstrap");
    const loader = vi.fn();
    await bootstrapExtensions(loader);
    expect(loader).not.toHaveBeenCalled();
  });
});
